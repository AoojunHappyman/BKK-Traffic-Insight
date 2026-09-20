"""Read-only APIs over accepted surveys, with parameterized SQL and pagination."""
from datetime import date
from decimal import Decimal
import re

from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import BadRequest

from app.database import connect
from app.extensions import limiter
from app.exports import download
from app.map_quality import coordinate_pending
from app.temporal import analyze_time
from app.vehicles import analyze_vehicles, CATEGORIES

api = Blueprint('traffic', __name__)


@api.get('/api/vehicles/options')
def vehicle_options():
    return jsonify(periods=query("""SELECT DISTINCT TIME_FORMAT(period_start,'%%H:%%i') AS start,
        TIME_FORMAT(period_end,'%%H:%%i') AS end FROM traffic_observation ORDER BY start, end"""))


@api.get('/api/vehicles')
@limiter.limit(lambda: current_app.config['VEHICLES_RATE_LIMIT'])
def vehicle_data():
    if 'limit' in request.args or 'offset' in request.args:
        raise BadRequest('Vehicle analysis does not support pagination')
    where, params = vehicle_filters()
    rows = query("""SELECT s.survey_id, s.survey_date, s.intersection_name, o.road_id,
        o.vehicle_total, o.duration_minutes, o.passenger_car, o.van_pickup,
        o.large_bus, o.small_bus, o.truck, o.three_wheeler,
        TIME_FORMAT(o.period_start,'%%H:%%i') AS start, TIME_FORMAT(o.period_end,'%%H:%%i') AS end
        FROM traffic_observation o JOIN survey s ON s.survey_id=o.survey_id""" + where, params)
    response = jsonify(analyze_vehicles(rows))
    response.cache_control.public = True
    response.cache_control.max_age = 60
    response.add_etag()
    return response.make_conditional(request)


def vehicle_filters():
    where, params, _, _ = filters(extra_allowed={'period'})
    if 'period' in request.args:
        raw = request.args['period']
        if not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d', raw):
            raise BadRequest('period must be HH:MM-HH:MM')
        start, end = raw.split('-')
        if start >= end:
            raise BadRequest('period start must precede end')
        where += (' AND ' if where else ' WHERE ') + 'o.period_start = %s AND o.period_end = %s'
        params += [start, end]
    return where, params


@api.get('/api/export/<view>.<format_name>')
@limiter.limit(lambda: current_app.config['EXPORT_RATE_LIMIT'])
def export_data(view, format_name):
    if view not in {'overview', 'map', 'temporal', 'vehicles'} or format_name not in {'csv', 'xlsx'}:
        raise BadRequest('Unsupported export page or format')
    if 'limit' in request.args or 'offset' in request.args:
        raise BadRequest('Exports include all filtered observations; pagination is not supported')
    if view == 'vehicles':
        where, params = vehicle_filters()
    else:
        where, params, _, _ = filters()
    max_rows = current_app.config['EXPORT_MAX_ROWS']
    rows = query("""SELECT o.observation_id, o.survey_id, o.source_row, s.survey_date,
        s.intersection_name, r.road_name, s.latitude, s.longitude,
        TIME_FORMAT(o.period_start,'%%H:%%i') AS period_start,
        TIME_FORMAT(o.period_end,'%%H:%%i') AS period_end, o.duration_minutes,
        o.passenger_car, o.van_pickup, o.large_bus, o.small_bus, o.truck, o.three_wheeler,
        o.vehicle_total, s.sheet_name, f.filename
        FROM traffic_observation o JOIN survey s ON s.survey_id=o.survey_id
        JOIN survey_road r ON r.road_id=o.road_id JOIN source_file f ON f.source_id=s.source_id""" + where +
        ' ORDER BY s.survey_date, s.survey_id, r.road_id, o.period_start, o.observation_id LIMIT %s',
        params + [max_rows + 1])
    if len(rows) > max_rows:
        raise BadRequest('Export is too large. Narrow the filters and try again.')
    if view == 'map':
        rows = [r for r in rows if map_ready(r)]
    return download(rows, view, format_name, request.args)


def map_ready(row):
    return (not coordinate_pending(row) and row['latitude'] is not None and row['longitude'] is not None
            and -90 <= row['latitude'] <= 90 and -180 <= row['longitude'] <= 180)


@api.get('/api/temporal')
def temporal_data():
    if 'limit' in request.args or 'offset' in request.args:
        raise BadRequest('Temporal analysis does not support pagination')
    where, params, _, _ = filters()
    rows = query("""SELECT s.survey_id, s.survey_date, o.road_id, o.vehicle_total,
        o.duration_minutes, TIME_FORMAT(o.period_start,'%%H:%%i') AS start,
        TIME_FORMAT(o.period_end,'%%H:%%i') AS end
        FROM traffic_observation o JOIN survey s ON s.survey_id=o.survey_id""" + where, params)
    return jsonify(analyze_time(rows))


@api.get('/api/map')
def map_data():
    # Return every matching survey; a paginated map would silently omit points.
    if 'limit' in request.args or 'offset' in request.args:
        raise BadRequest('Map does not support pagination')
    where, params, _, _ = filters()
    rows = query('''SELECT s.survey_id, s.intersection_name, s.survey_date,
        s.latitude, s.longitude, f.filename, s.sheet_name,
        COUNT(DISTINCT o.road_id) AS road_count,
        COALESCE(SUM(o.vehicle_total), 0) AS vehicle_total
        FROM survey s JOIN source_file f ON f.source_id=s.source_id
        LEFT JOIN traffic_observation o ON o.survey_id=s.survey_id''' + where + '''
        GROUP BY s.survey_id, s.intersection_name, s.survey_date,
            s.latitude, s.longitude, f.filename, s.sheet_name
        ORDER BY s.survey_date DESC, s.intersection_name, s.survey_id''', params)
    pending = [r for r in rows if coordinate_pending(r)]
    mapped = [r for r in rows if map_ready(r)]
    return jsonify(data=mapped, coordinate_review=pending, coverage={
        'matched': len(rows), 'mapped': len(mapped), 'excluded': len(rows) - len(mapped),
        'vehicle_total': sum(int(r['vehicle_total']) for r in mapped)},
        grain='survey; vehicle totals sum accepted observed roads and intervals')


def filters(extra_allowed=()):
    allowed = {'start_date', 'end_date', 'intersection_name', 'survey_id', 'limit', 'offset'} | set(extra_allowed)
    if set(request.args) - allowed or any(len(request.args.getlist(k)) != 1 for k in request.args):
        raise BadRequest('Unknown or repeated query parameter')
    clauses, values = [], []
    parsed = {}
    for key, operator in [('start_date', '>='), ('end_date', '<=')]:
        if key in request.args:
            raw = request.args[key]
            try:
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw):
                    raise ValueError()
                parsed[key] = date.fromisoformat(raw)
            except ValueError:
                raise BadRequest(f'{key} must be a valid YYYY-MM-DD date') from None
            clauses.append(f's.survey_date {operator} %s')
            values.append(raw)
    if len(parsed) == 2 and parsed['start_date'] > parsed['end_date']:
        raise BadRequest('start_date must not be after end_date')
    for key, column in [('intersection_name', 's.intersection_name'), ('survey_id', 's.survey_id')]:
        if key in request.args:
            raw = request.args[key]
            if not raw or len(raw) > 512 or (key == 'survey_id' and not re.fullmatch('[0-9a-f]{64}', raw)):
                raise BadRequest(f'Invalid {key}')
            clauses.append(f'{column} = %s')
            values.append(raw)
    try:
        limit, offset = int(request.args.get('limit', '100')), int(request.args.get('offset', '0'))
        if not 1 <= limit <= 500 or not 0 <= offset <= 1000000:
            raise ValueError()
    except ValueError:
        raise BadRequest('limit must be 1–500 and offset 0–1000000') from None
    return (' WHERE ' + ' AND '.join(clauses) if clauses else ''), values, limit, offset


def query(sql, params=()):
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall()
    return [{k: (v.isoformat() if isinstance(v, date) else
                 (float(v) if k in {'latitude', 'longitude'} else int(v) if v == v.to_integral_value() else str(v))
                 if isinstance(v, Decimal) else v)
             for k, v in row.items()} for row in rows]


@api.get('/api/surveys')
def surveys():
    where, params, limit, offset = filters()
    rows = query('SELECT s.*, f.filename FROM survey s JOIN source_file f ON f.source_id=s.source_id' + where +
                 ' ORDER BY s.survey_date, s.survey_id LIMIT %s OFFSET %s', params + [limit, offset])
    return jsonify(data=rows, limit=limit, offset=offset, returned=len(rows))


@api.get('/api/traffic')
def traffic():
    where, params, limit, offset = filters()
    rows = query("""SELECT o.observation_id, o.survey_id, o.source_row, s.survey_date,
        s.intersection_name, r.road_name, TIME_FORMAT(o.period_start, '%%H:%%i:%%s') AS period_start,
        TIME_FORMAT(o.period_end, '%%H:%%i:%%s') AS period_end, o.duration_minutes,
        o.passenger_car, o.van_pickup, o.large_bus, o.small_bus, o.truck, o.three_wheeler,
        o.vehicle_total, s.sheet_name, f.filename
        FROM traffic_observation o JOIN survey s ON s.survey_id=o.survey_id
        JOIN survey_road r ON r.road_id=o.road_id JOIN source_file f ON f.source_id=s.source_id""" + where +
        ' ORDER BY s.survey_date, o.observation_id LIMIT %s OFFSET %s', params + [limit, offset])
    return jsonify(data=rows, limit=limit, offset=offset, returned=len(rows), grain='road/survey/observed interval')


@api.get('/api/traffic/summary')
def summary():
    where, params, _, _ = filters()
    result = query('''SELECT COUNT(*) AS observation_count, COUNT(DISTINCT o.survey_id) AS survey_count,
        COUNT(DISTINCT o.road_id) AS road_count, COALESCE(SUM(o.vehicle_total),0) AS vehicle_total
        FROM traffic_observation o JOIN survey s ON s.survey_id=o.survey_id''' + where, params)[0]
    result['vehicle_total'] = int(result['vehicle_total'])
    return jsonify(data=result, note='Accepted surveyed intervals only; not continuous monthly traffic. Pagination does not limit this summary.')


@api.get('/api/overview/options')
def overview_options():
    bounds = query('SELECT MIN(survey_date) AS start_date, MAX(survey_date) AS end_date FROM survey')[0]
    names = query('SELECT DISTINCT intersection_name FROM survey ORDER BY intersection_name')
    coverage = query('''SELECT COUNT(*) AS surveys, SUM(latitude IS NULL OR longitude IS NULL) AS without_coordinates
                        FROM survey''')[0]
    issues = query("SELECT COUNT(DISTINCT survey_id) AS quarantined_surveys FROM data_quality_issue WHERE severity='error'")[0]
    return jsonify(**bounds, locations=[r['intersection_name'] for r in names], coverage=coverage, **issues)


@api.get('/api/overview')
def overview_data():
    where, params, _, _ = filters()
    base = ' FROM traffic_observation o JOIN survey s ON s.survey_id=o.survey_id'
    totals = query('''SELECT COUNT(*) AS observation_count, COUNT(DISTINCT o.survey_id) AS survey_count,
        COUNT(DISTINCT o.road_id) AS road_count, COALESCE(SUM(o.vehicle_total),0) AS vehicle_total,
        MIN(s.survey_date) AS first_survey, MAX(s.survey_date) AS last_survey''' + base + where, params)[0]
    # Category definitions are the existing dataset schema, not invented UI counts.
    totals['vehicle_type_count'] = len(CATEGORIES) if totals['observation_count'] else 0
    periods = query("""SELECT TIME_FORMAT(o.period_start,'%%H:%%i') AS start,
        TIME_FORMAT(o.period_end,'%%H:%%i') AS end, o.duration_minutes,
        SUM(o.vehicle_total) AS vehicle_total, COUNT(*) AS observation_count""" + base + where +
        ' GROUP BY o.period_start, o.period_end, o.duration_minutes ORDER BY o.period_start, o.period_end', params)
    locations = query('''SELECT s.intersection_name, SUM(o.vehicle_total) AS vehicle_total,
        COUNT(*) AS observation_count,
        COUNT(DISTINCT s.survey_id) AS survey_count, MIN(s.survey_date) AS first_survey,
        MAX(s.survey_date) AS last_survey''' + base + where +
        ' GROUP BY s.intersection_name ORDER BY vehicle_total DESC, s.intersection_name LIMIT 10', params)
    coverage = query('''SELECT COUNT(*) AS surveys,
        COALESCE(SUM(s.latitude IS NOT NULL AND s.longitude IS NOT NULL),0) AS mapped,
        COALESCE(SUM(WEEKDAY(s.survey_date) < 5),0) AS weekday,
        COALESCE(SUM(WEEKDAY(s.survey_date) >= 5),0) AS weekend,
        COUNT(DISTINCT CASE WHEN WEEKDAY(s.survey_date) < 5 THEN s.survey_date END) AS weekday_dates,
        COUNT(DISTINCT CASE WHEN WEEKDAY(s.survey_date) >= 5 THEN s.survey_date END) AS weekend_dates
        FROM survey s''' + where, params)[0]
    monthly = query("""SELECT DATE_FORMAT(s.survey_date,'%%Y-%%m') AS month,
        SUM(o.vehicle_total) AS vehicle_total, COUNT(DISTINCT s.survey_id) AS survey_count,
        COUNT(DISTINCT s.intersection_name) AS location_count, COUNT(*) AS observation_count
        """ + base + where + " GROUP BY DATE_FORMAT(s.survey_date,'%%Y-%%m') ORDER BY month", params)
    return jsonify(totals=totals, periods=periods, locations=locations, insight_coverage=coverage, monthly=monthly)
