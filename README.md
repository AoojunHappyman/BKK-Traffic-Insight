# Bangkok Traffic Insight

แดชบอร์ดวิเคราะห์ข้อมูลปริมาณจราจรจากรายงานสำรวจของกรุงเทพมหานคร ครอบคลุมภาพรวม แผนที่ ช่วงเวลา และประเภทรถ พร้อมตัวกรองและการส่งออก CSV/Excel

**Live demo:** https://bangkok-traffic-insight.onrender.com/

> ข้อมูลเป็นผลสำรวจย้อนหลัง ไม่ใช่ข้อมูลจราจรสด ยอดรถสูงไม่เท่ากับความแออัด และผลลัพธ์ไม่ควรใช้แทนสถานการณ์จราจรทั้งกรุงเทพฯ

## สถานะปัจจุบัน

ระบบทำงานบน Flask/Gunicorn และอ่านข้อมูลจริงจาก MySQL ผ่าน TLS โดย Deploy เป็น Docker container บน Render ใช้ Aiven MySQL เก็บข้อมูลถาวร และ Render Key Value (Redis-compatible) เก็บตัวนับ rate limit

ชุดข้อมูลปัจจุบันผ่าน cleaning และ validation แล้ว โดยไม่รวมรายงานปี 2022 ตามขอบเขตของโปรเจกต์:

| รายการ | จำนวน |
|---|---:|
| กลุ่มสำรวจ | 820 |
| กลุ่มถนน | 1,569 |
| รายการช่วงเวลา | 4,707 |
| ยอดรถรวมจากการสำรวจ | 30,651,553 คัน |
| กลุ่มที่มีพิกัด | 807 / 820 (98.4%) |
| กลุ่มที่ยังแยกไว้ตรวจ | 9 |

การตรวจ 9 กลุ่มกับ Excel ต้นฉบับไม่พบค่าทดแทนที่พิสูจน์ได้ จึงยังไม่รวมกลุ่มเหล่านี้ในฐานข้อมูล รายละเอียดอยู่ใน [รายงาน quarantine audit](reports/quarantine_review_20260915.md)

## ฟีเจอร์

- **Overview** — KPI ตามตัวกรอง กราฟช่วงเวลา แนวโน้มรายเดือน อันดับสถานที่ และสรุปคุณภาพข้อมูล
- **Map** — Leaflet + OpenStreetMap, heatmap, clustered traffic points, popup และ legend โดยเว้นเฉพาะกลุ่มที่ไม่มีพิกัด
- **Time analysis** — เปรียบเทียบช่วงสำรวจและจันทร์–ศุกร์กับเสาร์–อาทิตย์ พร้อมอัตราต่อชั่วโมงสำรวจและข้อจำกัดของตัวอย่าง
- **Vehicle types** — วิเคราะห์รถ 6 หมวดตามสถานที่และช่วงเวลา ทั้งจำนวน สัดส่วน และอัตราต่อชั่วโมงสำรวจ
- **Filtering & Export** — กรองวันที่/สถานที่/ช่วงสำรวจ และดาวน์โหลดผลเป็น CSV UTF-8 BOM หรือ Excel พร้อม metadata
- **Responsive UI** — รองรับ desktop, tablet และ mobile รวมการแก้ date input สำหรับ iOS
- **Production controls** — verified MySQL TLS, health checks, Redis-backed rate limiting, gzip, ETag และ security headers

## เทคโนโลยี

- Python, Flask, Gunicorn, PyMySQL
- MySQL 8.4, Redis/Valkey
- Pandas, OpenPyXL
- HTML, CSS, JavaScript, Chart.js
- Leaflet, Leaflet.heat, Leaflet.markercluster, OpenStreetMap
- Docker, Docker Compose, Render, Aiven
- Python `unittest` และ Node.js regression tests

## โครงสร้างโปรเจกต์

```text
app/                    Flask application, API, templates และ static assets
pipeline/
  profile.py            สำรวจโครงสร้าง CSV/XLSX โดยไม่แก้ต้นฉบับ
  clean.py              แปลง ตรวจยอด และแยกข้อมูลที่ต้องตรวจ
  audit_quarantine.py   สร้างหลักฐานตรวจกลุ่มที่ถูกกักไว้
  import_mysql.py       ตรวจและนำเข้า MySQL แบบ transaction/idempotent
data/raw/               ข้อมูลต้นฉบับทางเลือก (ไม่เข้า Git)
data/processed/         cleaning outputs ที่ผ่านการตรวจ (ไม่เข้า Git)
reports/                รายงานคุณภาพข้อมูลและหลักฐานการตัดสินใจ
sql/schema.sql          MySQL schema
tests/                  Python และ JavaScript regression tests
deploy/                 คู่มือ Production และ Free hosting
Dockerfile              Production image สำหรับ Gunicorn
compose.production.yml  Web + MySQL + Redis สำหรับ Linux/Docker
render.yaml             Render Blueprint สำหรับ Free deployment
```

ข้อมูลจริงและ credentials ถูกกันออกจาก Git โดยตั้งใจให้ repository มีเฉพาะโค้ด schema รายงานตรวจ และไฟล์ตัวอย่าง environment

## เริ่มใช้งานในเครื่อง

ต้องมี Python 3.11+, MySQL และ Node.js สำหรับ JavaScript tests จากนั้นรันใน PowerShell:

```powershell
cd 'C:\Users\ASUS\Desktop\BKK Traffic Insight'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

กรอก `DB_USER` และ `DB_PASSWORD` ใน `.env` แล้วสร้าง schema และนำเข้าชุดข้อมูลที่ผ่านการตรวจ:

```powershell
.\.venv\Scripts\python.exe -m pipeline.import_mysql data/processed/run_without_2022 --init-schema
```

ถ้าฐานข้อมูลมี schema อยู่แล้ว ให้ตัด `--init-schema` ออก การนำเข้าซ้ำจะเป็น no-op เมื่อข้อมูลตรงกัน และ rollback หากข้อมูลเดิมขัดแย้ง

เปิดเว็บสำหรับพัฒนา:

```powershell
.\.venv\Scripts\python.exe -m flask --app app:create_app run
```

- Dashboard: http://127.0.0.1:5000/
- Map: http://127.0.0.1:5000/map
- Time analysis: http://127.0.0.1:5000/temporal
- Vehicle types: http://127.0.0.1:5000/vehicles
- Database readiness: http://127.0.0.1:5000/api/health
- Process liveness: http://127.0.0.1:5000/health/live

## Data pipeline

```text
XLSX ต้นฉบับ
  → profile โครงสร้างและ SHA-256
  → clean ทุก sheet และคำนวณยอดจากรถ 6 ประเภท
  → accepted records + issues + quarantined evidence
  → ตรวจ identity, relationships, totals และปีที่อนุญาต
  → transactional MySQL import
  → Flask API และ Dashboard
```

สร้าง inventory โดยไม่แก้ไฟล์ต้นฉบับ:

```powershell
.\.venv\Scripts\python.exe -m pipeline.profile 'C:\Users\ASUS\Downloads\Report' --output reports/inventory.json
```

สร้าง cleaning output ใหม่:

```powershell
.\.venv\Scripts\python.exe -m pipeline.clean 'C:\Users\ASUS\Downloads\Report' --output data/processed/my_next_run
```

Exit code ของ cleaning คือ `0` เมื่อไม่มีปัญหา, `2` เมื่อสร้าง output สำเร็จแต่มีข้อมูลแยกไว้ตรวจ และ `1` เมื่อประมวลผลไม่สำเร็จ อ่าน `summary.json` และ `issues.json` ทุกครั้งก่อนนำเข้า

Output หลักประกอบด้วย `sources`, `surveys`, `roads`, `observations`, `issues`, `all_surveys`, `rejected_rows` และ `summary` ดูกฎทั้งหมดที่ [pipeline/cleaning/README.md](pipeline/cleaning/README.md)

## API และ Export

API หลัก:

- `/api/overview` และ `/api/overview/options`
- `/api/map`
- `/api/temporal`
- `/api/vehicles` และ `/api/vehicles/options`
- `/api/surveys`, `/api/traffic`, `/api/traffic/summary`
- `/api/export/<view>.csv` และ `/api/export/<view>.xlsx`

หน้าวิเคราะห์รองรับ `start_date`, `end_date`, `intersection_name` และ `survey_id`; Vehicle types รองรับ `period` เพิ่มเติม Export รองรับ view `overview`, `map`, `temporal`, `vehicles` และใช้ตัวกรองเดียวกับหน้าจอ

Production บน Render จำกัด Export 6 ครั้งต่อนาทีต่อ client และสูงสุด 10,000 แถวต่อไฟล์ ส่วน Vehicles API จำกัด 30 ครั้งต่อนาที JSON ขนาดใหญ่ถูกบีบอัดและใช้ ETag/cache 60 วินาที

## ทดสอบ

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
Get-ChildItem tests\*.cjs | ForEach-Object { node $_.FullName }
```

ชุดทดสอบครอบคลุม cleaning/import policy, transaction rollback, API filters, สูตรวิเคราะห์, export controls, heatmap lifecycle, trend data และ production configuration

## Deploy

Production start command:

```text
gunicorn --config gunicorn.conf.py wsgi:app
```

มีสองแนวทาง:

1. **Free portfolio deployment:** Render Web + Render Key Value + Aiven MySQL — ดู [deploy/FREE_HOSTING.md](deploy/FREE_HOSTING.md)
2. **Linux server with Docker:** Web + MySQL 8.4 + Redis — ดู [deploy/README.md](deploy/README.md)

ข้อมูลใน `data/processed` ไม่เข้า Git จึงต้องส่งชุดที่ผ่านการตรวจไปยังฐานข้อมูลแยกต่างหาก บัญชีเว็บควรมีเฉพาะสิทธิ์ `SELECT`; การสร้าง schema และ import ใช้บัญชีแยกที่มีสิทธิ์เขียน

Free deployment อาจพักบริการหลังไม่มีการใช้งาน ทำให้การเปิดครั้งแรกช้าประมาณหนึ่งนาที และไม่มี SLA เหมาะสำหรับ portfolio/demo มากกว่าระบบที่ต้องพร้อมใช้งานตลอดเวลา

## ข้อจำกัดของข้อมูล

- ข้อมูลครอบคลุมเฉพาะวัน สถานที่ ถนน และช่วงเวลาที่มีการสำรวจ ไม่ใช่การเก็บต่อเนื่อง
- “วันหยุด” ในหน้า Time analysis หมายถึงเสาร์–อาทิตย์ ยังไม่รวมปฏิทินวันหยุดราชการไทย
- จำนวนตัวอย่างวันธรรมดาและสุดสัปดาห์ไม่สมดุล จึงไม่ควรตีความเป็นเหตุและผล
- ไม่มีความเร็วรถ, Traffic Index หรือสถานะรถติดปัจจุบัน ระบบจึงไม่สร้างค่าดังกล่าว
- ช่วงเวลายาวไม่เท่ากัน อัตราต่อชั่วโมงช่วยปรับระยะเวลาสำรวจ แต่ยังไม่ได้ควบคุมจำนวนช่องทาง สถานที่ หรือฤดูกาล
- 13 กลุ่มไม่มีพิกัด จึงรวมใน Overview/Time/Vehicles แต่ไม่แสดงบน Map
- ชื่อสถานที่คล้ายกันยังไม่ถือว่าเป็นสถานที่เดียวกันข้ามรายงานหากไม่มีหลักฐานรองรับ

แหล่งอ้างอิงข้อมูล:

- [สำนักการจราจรและขนส่ง กรุงเทพมหานคร](https://traffic.bangkok.go.th/re_intersection/intersection/intersection.html)
- [BKK Open Data](https://data.bangkok.go.th/)

เอกสารการตรวจชุดข้อมูลอยู่ที่ [reports/dataset_review.md](reports/dataset_review.md), [reports/cleaning_review.md](reports/cleaning_review.md) และ [reports/mysql_integration.md](reports/mysql_integration.md)

## ผู้พัฒนา

Developed by [Pattanachai Sawetbunchoed](https://aoojunhappyman.github.io/My-Profile/#home)
