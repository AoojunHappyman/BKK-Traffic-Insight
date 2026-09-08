# Bangkok Traffic Analytics

Understanding When, Where, and Why Bangkok Gets Congested

โปรเจกต์ Portfolio วิเคราะห์ข้อมูลจราจรกรุงเทพฯ ด้วย Python, SQL และเว็บ Dashboard
เวอร์ชันแรกไม่ใช้ Machine Learning

## สถานะ: Phase 1 — Cleaning pipeline และ schema พร้อมแล้ว

ทำแล้ว: โครงสร้างโปรเจกต์, เครื่องมือตรวจ CSV/XLSX แบบอ่านอย่างเดียว,
cleaning pipeline สำหรับ XLSX ชุดจริง, MySQL schema ที่ทดสอบแล้ว และ Flask health endpoint

ยังไม่ทำ: importer/การเชื่อม Flask กับ MySQL จริง,
traffic API, Dashboard, แผนที่, สูตร hotspot หรือสถิติ
ข้อมูลจริงได้รับแล้วในโฟลเดอร์ `C:/Users/ASUS/Downloads/Report`
ผลตรวจเบื้องต้นอยู่ใน [reports/dataset_review.md](reports/dataset_review.md)
ผล cleaning ล่าสุดอยู่ใน [reports/cleaning_review.md](reports/cleaning_review.md)
ใช้ชุดที่ผ่านใน `data/processed/run_20260909_final/`

## โครงสร้างและหน้าที่

```text
app/                    Flask application factory และส่วนเว็บในอนาคต
  routes/               REST endpoints ในอนาคต
  services/             logic สำหรับ API
  models/               database access หลังยืนยัน schema
  analytics/            สถิติและการรวมข้อมูลในอนาคต
  templates/            HTML ในอนาคต
  static/css/, js/      frontend assets ในอนาคต
pipeline/
  profile.py            ตรวจไฟล์และสร้าง inventory JSON
  clean.py              แปลง XLSX ตรวจยอดรวม และแยกกลุ่มที่มีปัญหา
  cleaning/README.md    กฎ cleaning และขอบเขตที่รองรับ
data/raw/               ที่วางข้อมูลต้นฉบับทางเลือก (ไม่เข้า Git)
data/processed/         ผลแปลงข้อมูลในอนาคต (ไม่เข้า Git)
reports/                ผลตรวจข้อมูลและข้อจำกัด
sql/schema.sql          ตารางและข้อกำหนด MySQL
sql/README.md           ความสัมพันธ์ตารางและวิธีจับคู่ outputs
tests/                  ตรวจ preservation และ error handling
requirements.txt        dependencies สำหรับขั้นปัจจุบัน
.env.example            ตัวอย่าง DB configuration สำหรับขั้นถัดไป
```

## ติดตั้งและรัน

รันคำสั่งต่อไปนี้ใน **PowerShell ที่โฟลเดอร์โปรเจกต์** ใช้ Python 3.11 ขึ้นไป:

```powershell
cd 'C:\Users\ASUS\Desktop\BKK Traffic Insight'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pipeline.profile 'C:\Users\ASUS\Downloads\Report' --output reports/inventory.json
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m flask --app app:create_app run
```

เปิด `http://127.0.0.1:5000/api/health` ได้ผล:

```json
{"status":"ok","phase":"1-preparation","database":"not_configured"}
```

ยังไม่มีหน้าเว็บที่ `/` และไม่มี traffic endpoints
ไฟล์ `.env.example` เป็นตัวอย่างเท่านั้น ขั้นนี้ยังไม่อ่านค่าหรือเชื่อมต่อ MySQL
เมื่อเพิ่ม database integration จะอ่าน credentials จาก environment variables
ห้าม commit `.env` หรือรหัสผ่าน

## Data pipeline ปัจจุบัน

```text
ต้นฉบับ CSV/XLSX → SHA-256 → อ่านทุก sheet → ตรวจ layout → inventory.json
ต้นฉบับ XLSX → แยกกลุ่มสำรวจ/ถนน/เวลา → ตรวจยอดรวม → ข้อมูลที่ผ่าน + ข้อมูลที่ต้องตรวจ
```

เครื่องมือเก็บชื่อไฟล์, path, hash, ชื่อ sheet, merged ranges, ตำแหน่งสูตร,
ชนิดข้อมูลที่พบในแต่ละคอลัมน์, จำนวนเซลล์ว่าง, แถวซ้ำทั้งแถว และ preview 14 แถวแรก
หมายเลขแถวเริ่มที่ 1 และคอลัมน์ใช้ตัวอักษร Excel เพื่อตรวจย้อนกลับได้
ประมวลผลไฟล์ในโฟลเดอร์ชั้นเดียว ข้าม lock files ที่ขึ้นต้นด้วย `~$`
ถ้ามีไฟล์อ่านไม่ได้ จะบันทึก error แล้วตรวจไฟล์อื่นต่อ และคืน exit code 1
การรันซ้ำจะเขียนทับเฉพาะรายงาน JSON ที่ระบุ

CSV อ่านทุกค่าเป็นข้อความ เก็บ `NA`, `NULL` และ `0` ตามต้นฉบับ
เลือก encoding/delimiter เองได้ เช่น `--encoding cp874 --delimiter ';'`
XLSX เก็บสูตรเป็นข้อความเพื่อให้ตรวจสอบได้ **ไม่คำนวณสูตรหรือเชื่อค่าที่ cache ไว้โดยอัตโนมัติ**
ใช้ openpyxl เพิ่มจาก Pandas เพราะต้องตรวจ merged cells และตำแหน่งสูตร
เวอร์ชันนี้โหลดแต่ละไฟล์ในหน่วยความจำ เหมาะกับรายงานชุดที่ได้รับ

จำนวนเซลล์ว่างยังไม่ใช่ missing observations เพราะรายงานมี merged cells และช่องว่างจัดหน้า
แถวซ้ำทั้งแถวยังไม่ใช่ duplicate business records
ชนิดข้อมูลที่รายงานไม่ใช่ data types ของ schema ขั้นสุดท้าย
เครื่องมือ profile ไม่แก้ไขต้นฉบับและไม่รวมยอดจราจร
ส่วน cleaning คำนวณยอดใหม่จากหกประเภทรถและตรวจเทียบ subtotal ของต้นฉบับ

## รัน Cleaning

รัน PowerShell ในโฟลเดอร์โปรเจกต์ ใช้ชื่อ output ใหม่ในแต่ละครั้ง:

```powershell
.\.venv\Scripts\python.exe -m pipeline.clean 'C:\Users\ASUS\Downloads\Report' --output data/processed/my_next_run
$LASTEXITCODE
```

Exit code `2` คือสร้าง outputs แล้วแต่มีข้อมูลที่แยกไว้ตรวจต่อ; `0` คือไม่มี error;
`1` คือรันไม่สำเร็จ อ่าน `summary.json` และ `issues.json` ก่อนใช้ข้อมูล
ไม่เขียนทับ output เดิมเพื่อเก็บประวัติการตรวจ

| Output | หน้าที่ |
|---|---|
| sources.json / .csv | ไฟล์และ hash |
| surveys.json / .csv | กลุ่มสำรวจที่ผ่าน วันที่ ชื่อสถานที่และพิกัด |
| roads.json / .csv | กลุ่มถนนในการสำรวจที่ผ่าน |
| observations.json / .csv | จำนวนรถหกประเภทตามช่วงเวลาที่ผ่าน |
| issues.json | สาเหตุ error/warning พร้อมที่มา |
| all_surveys.json | ทุกกลุ่มสำรวจและสถานะ |
| rejected_rows.json | แถวต้นทางพร้อม raw/cache ของกลุ่มที่ต้องตรวจ |
| summary.json | จำนวนที่ผ่าน/กันไว้ และเวอร์ชัน pipeline |

JSON เป็นรูปแบบหลัก CSV เป็นสำเนาสำหรับตรวจดู; ถ้าไม่มีแถวจะมีเฉพาะ JSON `[]`
ดู [กฎ cleaning](pipeline/cleaning/README.md) และ [โครงสร้างฐานข้อมูล](sql/README.md)

## แหล่งข้อมูลและข้อจำกัด

ไฟล์ที่ใช้จริง: ผู้ใช้ส่ง `Downloads/Report` จำนวน 31 XLSX
ลิงก์ที่ระบุในเอกสารโจทย์ (ยังไม่ได้ตรวจยืนยันที่มาของแต่ละไฟล์กับเว็บ):

- [สำนักการจราจรและขนส่ง กรุงเทพมหานคร](https://traffic.bangkok.go.th/re_intersection/intersection/intersection.html)
- [BKK Open Data](https://data.bangkok.go.th/)

ไม่มี mock traffic dataset ในโปรเจกต์; ข้อมูลจำลองมีเฉพาะ CSV ชั่วคราวใน unit tests
ยังไม่มีสูตร analytics, screenshots หรือผลวิเคราะห์ให้ตีความ
จำนวนรถสูงเพียงอย่างเดียวไม่ยืนยันความแออัด และ correlation ไม่ใช่ causation

## ขั้นถัดไป

ทบทวน 9 กลุ่มที่แยกไว้ตรวจต่อและพิกัดที่ขาด/ผิดรูปแบบ
จากนั้นเพิ่ม importer แบบ transaction, เชื่อม MySQL, traffic API และ Overview/Map ทีละขั้น
NumPy/SciPy, MySQL driver, Chart.js และ Leaflet จะเพิ่มเมื่อถึงงานที่ใช้จริง
