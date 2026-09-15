"""Known source-coordinate anomalies awaiting verification; never geocode by guess.

Only these exact survey/coordinate combinations are withheld from map rendering.
Corrected coordinates automatically stop matching. Survey totals remain intact.
"""
PENDING_COORDINATES = {
    ('c27893053fef8b68cb122cbf138d589b331bc0cb9ecb7e7654caf50865672767',
     13.382029, 100.601413),  # หน้า บ.ยัสปาล, May2025.xlsx, 2025-05-07
    ('8ffe20e0bd14ea5a025110ad6da38c9a850c9635c352d71fd0a0368d7fb1a57b',
     13.323308, 100.62221),  # ใกล้หมู่บ้านพฤกษ์ ภิรมณ์, Jan2025.xlsx, 2025-01-08
}


def coordinate_pending(row):
    return (row.get('survey_id'), row.get('latitude'), row.get('longitude')) in PENDING_COORDINATES
