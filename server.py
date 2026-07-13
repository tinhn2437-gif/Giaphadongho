from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import shutil
import time
import unicodedata
import uuid
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"
PHOTO_DIR = UPLOAD_DIR / "photos"
DATA_FILE = DATA_DIR / "family.json"
USERS_FILE = DATA_DIR / "users.json"

ADMIN_USER = os.environ.get("FAMILY_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("FAMILY_ADMIN_PASSWORD", "")
SECRET = os.environ.get("FAMILY_SECRET", "doi-mat-khau-bi-mat-" + str(BASE_DIR)).encode("utf-8")
COOKIE_NAME = "family_admin"
VIEWER_COOKIE_NAME = "family_viewer"
REQUIRE_VIEW_LOGIN = os.environ.get("FAMILY_REQUIRE_VIEW_LOGIN", "1") != "0"
MAX_JSON_SIZE = 12 * 1024 * 1024
PASSWORD_ITERATIONS = 120000

R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "").strip()
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
R2_BUCKET = os.environ.get("R2_BUCKET", "").strip()
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "").strip().rstrip("/")


def ensure_storage():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps(seed_data(), ensure_ascii=False, indent=2), encoding="utf-8")
    if not USERS_FILE.exists():
        USERS_FILE.write_text(json.dumps({"users": []}, ensure_ascii=False, indent=2), encoding="utf-8")


def seed_data():
    people = [
        {
            "id": "p1",
            "fullName": "Cụ Nguyễn Hữu An",
            "gender": "Nam",
            "birthDate": "1932-02-10",
            "deathDate": "",
            "marriageYear": "",
            "familyRole": "Khác",
            "hometown": "Quê nhà",
            "currentResidence": "Quê nhà",
            "daughterInLawFather": "",
            "daughterInLawMother": "",
            "address": "Quê nhà",
            "job": "Nông nghiệp",
            "achievements": ["Gia đình văn hóa cấp huyện"],
            "fatherId": "",
            "motherId": "",
            "spouseIds": ["p2"],
            "photo": "",
            "notes": "Người khởi đầu nhánh gia phả mẫu.",
        },
        {
            "id": "p2",
            "fullName": "Cụ bà Trần Thị Bình",
            "gender": "Nữ",
            "birthDate": "1936-09-18",
            "deathDate": "",
            "marriageYear": "",
            "familyRole": "Khác",
            "hometown": "Quê nhà",
            "currentResidence": "Quê nhà",
            "daughterInLawFather": "",
            "daughterInLawMother": "",
            "address": "Quê nhà",
            "job": "Nội trợ",
            "achievements": [],
            "fatherId": "",
            "motherId": "",
            "spouseIds": ["p1"],
            "photo": "",
            "notes": "",
        },
        {
            "id": "p3",
            "fullName": "Ông Nguyễn Hữu Cường",
            "gender": "Nam",
            "birthDate": "1960-05-22",
            "deathDate": "",
            "marriageYear": "",
            "familyRole": "Con trai",
            "hometown": "Quê nhà",
            "currentResidence": "Hà Nội",
            "daughterInLawFather": "",
            "daughterInLawMother": "",
            "address": "Hà Nội",
            "job": "Giáo viên",
            "achievements": ["Giáo viên dạy giỏi cấp tỉnh"],
            "fatherId": "p1",
            "motherId": "p2",
            "spouseIds": ["p4"],
            "photo": "",
            "notes": "",
        },
        {
            "id": "p4",
            "fullName": "Bà Lê Thị Dung",
            "gender": "Nữ",
            "birthDate": "1963-11-04",
            "deathDate": "",
            "marriageYear": "",
            "familyRole": "Con dâu",
            "hometown": "Hà Nội",
            "currentResidence": "Hà Nội",
            "daughterInLawFather": "",
            "daughterInLawMother": "",
            "address": "Hà Nội",
            "job": "Kế toán",
            "achievements": [],
            "fatherId": "",
            "motherId": "",
            "spouseIds": ["p3"],
            "photo": "",
            "notes": "",
        },
        {
            "id": "p5",
            "fullName": "Nguyễn Hữu Minh Đức",
            "gender": "Nam",
            "birthDate": "1988-07-12",
            "deathDate": "",
            "marriageYear": "",
            "familyRole": "Con trai",
            "hometown": "Hà Nội",
            "currentResidence": "Đà Nẵng",
            "daughterInLawFather": "",
            "daughterInLawMother": "",
            "address": "Đà Nẵng",
            "job": "Kỹ sư",
            "achievements": ["Sáng kiến kỹ thuật cấp huyện"],
            "fatherId": "p3",
            "motherId": "p4",
            "spouseIds": ["p6"],
            "photo": "",
            "notes": "",
        },
        {
            "id": "p6",
            "fullName": "Phạm Thu Hà",
            "gender": "Nữ",
            "birthDate": "1990-03-03",
            "deathDate": "",
            "marriageYear": "",
            "familyRole": "Con dâu",
            "hometown": "Đà Nẵng",
            "currentResidence": "Đà Nẵng",
            "daughterInLawFather": "",
            "daughterInLawMother": "",
            "address": "Đà Nẵng",
            "job": "Bác sĩ",
            "achievements": ["Bằng khen cấp thành phố"],
            "fatherId": "",
            "motherId": "",
            "spouseIds": ["p5"],
            "photo": "",
            "notes": "",
        },
        {
            "id": "p7",
            "fullName": "Nguyễn Hữu An Nhiên",
            "gender": "Nữ",
            "birthDate": "2015-01-26",
            "deathDate": "",
            "marriageYear": "",
            "familyRole": "Con gái",
            "hometown": "Đà Nẵng",
            "currentResidence": "Đà Nẵng",
            "daughterInLawFather": "",
            "daughterInLawMother": "",
            "address": "Đà Nẵng",
            "job": "Học sinh",
            "achievements": ["Giải khuyến khích cấp huyện môn Toán"],
            "fatherId": "p5",
            "motherId": "p6",
            "spouseIds": [],
            "photo": "",
            "notes": "",
        },
    ]
    return {
        "familyName": "Gia phả dòng họ Nguyễn Hữu",
        "updatedAt": now_iso(),
        "people": people,
    }


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def read_data():
    ensure_storage()
    with DATA_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)
    data.setdefault("familyName", "Gia phả dòng họ Nguyễn Hữu")
    data.setdefault("people", [])
    return data


def write_data(data):
    data["updatedAt"] = now_iso()
    tmp = DATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.move(str(tmp), str(DATA_FILE))


def read_users():
    ensure_storage()
    try:
        with USERS_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = {"users": []}
    if not isinstance(data.get("users"), list):
        data["users"] = []
    return data


def write_users(data):
    data["updatedAt"] = now_iso()
    tmp = USERS_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.move(str(tmp), str(USERS_FILE))


def clean_text(value):
    if value is None:
        return ""
    return str(value).strip()


def normalize_username(value):
    username = unicodedata.normalize("NFD", clean_text(value)).encode("ascii", "ignore").decode("ascii")
    username = re.sub(r"[^a-zA-Z0-9_.-]+", "", username).lower()
    return username[:40]


def hash_password(password):
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "pbkdf2_sha256$%d$%s$%s" % (
        PASSWORD_ITERATIONS,
        b64url(salt),
        b64url(digest),
    )


def check_password(password, stored):
    try:
        scheme, iterations, salt_text, digest_text = stored.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode((salt_text + "=" * (-len(salt_text) % 4)).encode("ascii"))
        expected = base64.urlsafe_b64decode((digest_text + "=" * (-len(digest_text) % 4)).encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def clean_list(value):
    if isinstance(value, list):
        return [clean_text(item) for item in value if clean_text(item)]
    if isinstance(value, str):
        return [line.strip() for line in value.splitlines() if line.strip()]
    return []


def normalize_family_role(value):
    role = clean_text(value)
    key = unicodedata.normalize("NFD", role).encode("ascii", "ignore").decode("ascii").lower()
    key = re.sub(r"\s+", " ", key).strip()
    if key in ["con trai", "trai"]:
        return "Con trai"
    if key in ["con gai", "gai"]:
        return "Con gái"
    if key in ["con dau", "dau"]:
        return "Con dâu"
    return role or "Khác"


def normalize_education_level(value):
    label = clean_text(value)
    key = unicodedata.normalize("NFD", label).encode("ascii", "ignore").decode("ascii").lower()
    key = re.sub(r"[^a-z0-9]+", " ", key).strip()
    return {
        "pho thong": "Phổ thông",
        "cao dang": "Cao đẳng",
        "dai hoc": "Đại học",
    }.get(key, "")


def normalize_academic_title(value):
    label = clean_text(value)
    key = unicodedata.normalize("NFD", label).encode("ascii", "ignore").decode("ascii").lower()
    key = re.sub(r"[^a-z0-9]+", " ", key).strip()
    return {
        "thac si": "Thạc sĩ",
        "tien si": "Tiến sĩ",
        "pgs": "PGS",
        "pho giao su": "PGS",
        "pho giao su pgs": "PGS",
        "gs": "GS",
        "giao su": "GS",
        "giao su gs": "GS",
    }.get(key, "")


def normalize_person(raw, existing_id=None):
    person = {
        "id": existing_id or clean_text(raw.get("id")) or "p_" + uuid.uuid4().hex[:12],
        "fullName": clean_text(raw.get("fullName")),
        "gender": clean_text(raw.get("gender")) or "Khác",
        "birthDate": clean_text(raw.get("birthDate")),
        "deathDate": clean_text(raw.get("deathDate")),
        "marriageYear": clean_text(raw.get("marriageYear")),
        "familyRole": normalize_family_role(raw.get("familyRole")),
        "hometown": clean_text(raw.get("hometown")),
        "currentResidence": clean_text(raw.get("currentResidence")),
        "daughterInLawFather": clean_text(raw.get("daughterInLawFather")),
        "daughterInLawMother": clean_text(raw.get("daughterInLawMother")),
        "daughterHusbandName": clean_text(raw.get("daughterHusbandName")),
        "daughterMarriedAddress": clean_text(raw.get("daughterMarriedAddress")),
        "daughterChildrenCount": clean_text(raw.get("daughterChildrenCount")),
        "address": clean_text(raw.get("address")),
        "job": clean_text(raw.get("job")),
        "educationLevel": normalize_education_level(raw.get("educationLevel")),
        "academicTitle": normalize_academic_title(raw.get("academicTitle")),
        "achievements": clean_list(raw.get("achievements")),
        "fatherId": clean_text(raw.get("fatherId")),
        "motherId": clean_text(raw.get("motherId")),
        "spouseIds": clean_list(raw.get("spouseIds")),
        "photo": clean_text(raw.get("photo")),
        "galleryPhotos": clean_list(raw.get("galleryPhotos")),
        "notes": clean_text(raw.get("notes")),
    }
    if person["familyRole"] == "Con dâu":
        person["fatherId"] = ""
        person["motherId"] = ""
    else:
        person["daughterInLawFather"] = ""
        person["daughterInLawMother"] = ""
    if person["familyRole"] != "Con gái":
        person["daughterHusbandName"] = ""
        person["daughterMarriedAddress"] = ""
        person["daughterChildrenCount"] = ""
    return person


def normalize_relationships(data):
    people = data.get("people", [])
    valid = {person.get("id") for person in people}
    for person in people:
        if person.get("fatherId") not in valid:
            person["fatherId"] = ""
        if person.get("motherId") not in valid:
            person["motherId"] = ""
        person["spouseIds"] = [
            spouse_id
            for spouse_id in dict.fromkeys(person.get("spouseIds", []))
            if spouse_id in valid and spouse_id != person.get("id")
        ]

    by_id = {person["id"]: person for person in people}
    for person in people:
        for spouse_id in list(person.get("spouseIds", [])):
            spouse = by_id.get(spouse_id)
            if spouse is not None and person["id"] not in spouse["spouseIds"]:
                spouse["spouseIds"].append(person["id"])


def b64url(data):
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def sign_payload(payload):
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    body = b64url(raw)
    signature = b64url(hmac.new(SECRET, body.encode("ascii"), hashlib.sha256).digest())
    return body + "." + signature


def read_token(token):
    if not token or "." not in token:
        return None
    body, signature = token.rsplit(".", 1)
    expected = b64url(hmac.new(SECRET, body.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        padded = body + "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except Exception:
        return None
    if payload.get("exp", 0) <= int(time.time()):
        return None
    return payload


def verify_admin_token(token):
    payload = read_token(token)
    return bool(payload and payload.get("scope") == "admin" and payload.get("user") == ADMIN_USER)


def verify_viewer_token(token):
    payload = read_token(token)
    if not payload or payload.get("scope") != "viewer":
        return None
    username = normalize_username(payload.get("user"))
    if not username:
        return None
    users = read_users().get("users", [])
    return next((user for user in users if user.get("username") == username), None)


def safe_upload_name(filename):
    stem = re.sub(r"[^a-zA-Z0-9_-]+", "-", Path(filename).stem).strip("-")[:40] or "photo"
    ext = Path(filename).suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        ext = ".jpg"
    return f"{stem}-{uuid.uuid4().hex[:10]}{ext}"


def r2_enabled():
    return all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET])


def hmac_sha256(key, message):
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def r2_signing_key(date_stamp):
    key_date = hmac_sha256(("AWS4" + R2_SECRET_ACCESS_KEY).encode("utf-8"), date_stamp)
    key_region = hmac_sha256(key_date, "auto")
    key_service = hmac_sha256(key_region, "s3")
    return hmac_sha256(key_service, "aws4_request")


def upload_to_r2(object_key, content, content_type):
    if not r2_enabled():
        return ""
    host = f"{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    object_path = f"/{R2_BUCKET}/{object_key}"
    endpoint = f"https://{host}{object_path}"
    now = time.gmtime()
    amz_date = time.strftime("%Y%m%dT%H%M%SZ", now)
    date_stamp = time.strftime("%Y%m%d", now)
    payload_hash = hashlib.sha256(content).hexdigest()
    canonical_headers = (
        f"host:{host}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join([
        "PUT",
        object_path,
        "",
        canonical_headers,
        signed_headers,
        payload_hash,
    ])
    credential_scope = f"{date_stamp}/auto/s3/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])
    signature = hmac.new(r2_signing_key(date_stamp), string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = (
        "AWS4-HMAC-SHA256 "
        f"Credential={R2_ACCESS_KEY_ID}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    request = Request(endpoint, data=content, method="PUT", headers={
        "Authorization": authorization,
        "Content-Type": content_type,
        "Host": host,
        "X-Amz-Content-Sha256": payload_hash,
        "X-Amz-Date": amz_date,
    })
    with urlopen(request, timeout=25) as response:
        if response.status not in (200, 201):
            raise RuntimeError("R2 upload failed")
    return f"{R2_PUBLIC_URL}/{object_key}" if R2_PUBLIC_URL else ""


class FamilyHandler(BaseHTTPRequestHandler):
    server_version = "FamilyTree/1.0"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def is_local_request(self):
        host = self.headers.get("Host", "").split(":")[0].lower()
        return host in ["127.0.0.1", "localhost", "::1"]

    def block_public_admin(self):
        self.send_json({"error": "Trang admin chỉ mở trên máy chủ để bảo vệ dữ liệu gia phả."}, status=403)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/api/viewer-session":
            user = self.viewer_user()
            self.send_json({
                "authenticated": bool(user) or self.is_authenticated() or not REQUIRE_VIEW_LOGIN,
                "user": {"username": user.get("username"), "displayName": user.get("displayName", "")} if user else None,
                "registrationEnabled": False,
            })
            return
        if path == "/api/people":
            if not self.require_view_auth():
                return
            self.send_json(read_data())
            return
        if path == "/api/me":
            self.send_json({"authenticated": self.is_local_request() and self.is_authenticated()})
            return
        if path == "/admin" and not self.is_local_request():
            self.block_public_admin()
            return
        if path in ["/", "/admin"] or path.startswith("/person/"):
            self.serve_file(PUBLIC_DIR / "index.html")
            return
        if path.startswith("/uploads/"):
            if not self.require_view_auth():
                return
            self.serve_file(BASE_DIR / path.lstrip("/"))
            return
        self.serve_file(PUBLIC_DIR / path.lstrip("/"))

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/register":
            self.handle_register()
            return
        if parsed.path == "/api/view-login":
            self.handle_view_login()
            return
        if parsed.path == "/api/view-logout":
            self.send_response(204)
            self.send_header("Set-Cookie", f"{VIEWER_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly")
            self.end_headers()
            return
        if not self.is_local_request():
            self.block_public_admin()
            return
        if parsed.path == "/api/login":
            self.handle_login()
            return
        if parsed.path == "/api/logout":
            self.send_response(204)
            self.send_header("Set-Cookie", f"{COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly")
            self.end_headers()
            return
        if not self.require_auth():
            return
        if parsed.path == "/api/people":
            self.create_person()
            return
        if parsed.path == "/api/photos":
            self.save_photo()
            return
        if parsed.path == "/api/import":
            self.import_data()
            return
        self.not_found()

    def do_PUT(self):
        parsed = urlparse(self.path)
        if not self.is_local_request():
            self.block_public_admin()
            return
        if not self.require_auth():
            return
        if parsed.path.startswith("/api/people/"):
            person_id = unquote(parsed.path.split("/")[-1])
            self.update_person(person_id)
            return
        self.not_found()

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if not self.is_local_request():
            self.block_public_admin()
            return
        if not self.require_auth():
            return
        if parsed.path.startswith("/api/people/"):
            person_id = unquote(parsed.path.split("/")[-1])
            self.delete_person(person_id)
            return
        self.not_found()

    def handle_login(self):
        payload = self.read_json()
        username = clean_text(payload.get("username"))
        password = clean_text(payload.get("password"))
        if username == ADMIN_USER and password == ADMIN_PASSWORD:
            token = sign_payload({"scope": "admin", "user": username, "exp": int(time.time()) + 60 * 60 * 24 * 7})
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Set-Cookie", f"{COOKIE_NAME}={token}; Path=/; Max-Age=604800; SameSite=Lax; HttpOnly")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
            return
        self.send_json({"error": "Sai tài khoản hoặc mật khẩu."}, status=401)

    def handle_register(self):
        self.send_json({"error": "T\u00e0i kho\u1ea3n xem gia ph\u1ea3 do admin t\u1ea1o."}, status=403)
        return

        payload = self.read_json()
        username = normalize_username(payload.get("username"))
        display_name = clean_text(payload.get("displayName"))[:80]
        password = clean_text(payload.get("password"))
        if len(username) < 3:
            self.send_json({"error": "TÃ i khoáº£n cáº§n tá»« 3 kÃ½ tá»± trá»Ÿ lÃªn."}, status=400)
            return
        if len(password) < 6:
            self.send_json({"error": "Máº­t kháº©u cáº§n tá»« 6 kÃ½ tá»± trá»Ÿ lÃªn."}, status=400)
            return
        data = read_users()
        if any(user.get("username") == username for user in data["users"]):
            self.send_json({"error": "TÃ i khoáº£n nÃ y Ä‘Ã£ tá»“n táº¡i."}, status=409)
            return
        user = {
            "id": "u_" + uuid.uuid4().hex[:12],
            "username": username,
            "displayName": display_name or username,
            "passwordHash": hash_password(password),
            "createdAt": now_iso(),
        }
        data["users"].append(user)
        write_users(data)
        self.send_viewer_login(username, {"ok": True, "user": {"username": username, "displayName": user["displayName"]}}, status=201)

    def handle_view_login(self):
        payload = self.read_json()
        username = normalize_username(payload.get("username"))
        password = clean_text(payload.get("password"))
        user = next((item for item in read_users().get("users", []) if item.get("username") == username), None)
        if not user or not check_password(password, user.get("passwordHash", "")):
            self.send_json({"error": "Sai tÃ i khoáº£n hoáº·c máº­t kháº©u."}, status=401)
            return
        self.send_viewer_login(username, {"ok": True, "user": {"username": username, "displayName": user.get("displayName", "")}})

    def send_viewer_login(self, username, data, status=200):
        token = sign_payload({"scope": "viewer", "user": username, "exp": int(time.time()) + 60 * 60 * 24 * 30})
        self.send_json(data, status=status, cookies=[
            f"{VIEWER_COOKIE_NAME}={token}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly"
        ])

    def create_person(self):
        payload = self.read_json()
        person = normalize_person(payload)
        if not person["fullName"]:
            self.send_json({"error": "Vui lòng nhập họ tên."}, status=400)
            return
        data = read_data()
        data["people"].append(person)
        normalize_relationships(data)
        write_data(data)
        self.send_json(person, status=201)

    def update_person(self, person_id):
        payload = self.read_json()
        data = read_data()
        for index, person in enumerate(data["people"]):
            if person.get("id") == person_id:
                updated = normalize_person(payload, existing_id=person_id)
                selected_spouses = set(updated.get("spouseIds", []))
                for other in data["people"]:
                    if other.get("id") not in selected_spouses:
                        other["spouseIds"] = [sid for sid in other.get("spouseIds", []) if sid != person_id]
                data["people"][index] = updated
                normalize_relationships(data)
                write_data(data)
                self.send_json(data["people"][index])
                return
        self.send_json({"error": "Không tìm thấy người này."}, status=404)

    def delete_person(self, person_id):
        data = read_data()
        before = len(data["people"])
        data["people"] = [person for person in data["people"] if person.get("id") != person_id]
        if len(data["people"]) == before:
            self.send_json({"error": "Không tìm thấy người này."}, status=404)
            return
        for person in data["people"]:
            if person.get("fatherId") == person_id:
                person["fatherId"] = ""
            if person.get("motherId") == person_id:
                person["motherId"] = ""
            person["spouseIds"] = [sid for sid in person.get("spouseIds", []) if sid != person_id]
        write_data(data)
        self.send_json({"ok": True})

    def save_photo(self):
        payload = self.read_json()
        data_url = payload.get("dataUrl", "")
        filename = clean_text(payload.get("filename")) or "photo.jpg"
        if not isinstance(data_url, str) or "," not in data_url:
            self.send_json({"error": "Ảnh không hợp lệ."}, status=400)
            return
        header, encoded = data_url.split(",", 1)
        if not header.startswith("data:image/"):
            self.send_json({"error": "Chỉ hỗ trợ file ảnh."}, status=400)
            return
        try:
            content = base64.b64decode(encoded, validate=True)
        except Exception:
            self.send_json({"error": "Không đọc được ảnh."}, status=400)
            return
        if len(content) > 8 * 1024 * 1024:
            self.send_json({"error": "Ảnh quá lớn, hãy chọn ảnh dưới 8MB."}, status=400)
            return
        saved_name = safe_upload_name(filename)
        (PHOTO_DIR / saved_name).write_bytes(content)
        local_url = "/uploads/photos/" + saved_name
        if r2_enabled():
            content_type = mimetypes.guess_type(saved_name)[0] or "application/octet-stream"
            try:
                r2_url = upload_to_r2("photos/" + saved_name, content, content_type)
            except Exception as error:
                self.send_json({"error": "ÄÃ£ lÆ°u áº£nh local nhÆ°ng chá»¯a Ä‘áº©y Ä‘Æ°á»£c lÃªn R2: " + str(error)}, status=502)
                return
            self.send_json({"url": r2_url or local_url, "localUrl": local_url})
            return
        self.send_json({"url": local_url})

    def import_data(self):
        payload = self.read_json()
        family_name = clean_text(payload.get("familyName")) or "Gia phả dòng họ Nguyễn Hữu"
        people = payload.get("people")
        if not isinstance(people, list):
            self.send_json({"error": "File nhập phải có danh sách people."}, status=400)
            return
        clean_people = [normalize_person(person) for person in people if isinstance(person, dict) and clean_text(person.get("fullName"))]
        data = {"familyName": family_name, "people": clean_people}
        normalize_relationships(data)
        write_data(data)
        self.send_json(data)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length > MAX_JSON_SIZE:
            return {}
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def parse_cookies(self):
        cookies = {}
        for part in self.headers.get("Cookie", "").split(";"):
            if "=" in part:
                key, value = part.strip().split("=", 1)
                cookies[key] = value
        return cookies

    def is_authenticated(self):
        return verify_admin_token(self.parse_cookies().get(COOKIE_NAME))

    def viewer_user(self):
        return verify_viewer_token(self.parse_cookies().get(VIEWER_COOKIE_NAME))

    def require_view_auth(self):
        if not REQUIRE_VIEW_LOGIN or self.is_authenticated() or self.viewer_user():
            return True
        self.send_json({"error": "Báº¡n cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ xem gia pháº£."}, status=401)
        return False

    def require_auth(self):
        if self.is_authenticated():
            return True
        self.send_json({"error": "Bạn cần đăng nhập admin."}, status=401)
        return False

    def send_json(self, data, status=200, cookies=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def serve_file(self, path):
        try:
            resolved = path.resolve()
        except Exception:
            self.not_found()
            return
        allowed_roots = [PUBLIC_DIR.resolve(), UPLOAD_DIR.resolve()]
        if not any(str(resolved).startswith(str(root)) for root in allowed_roots) or not resolved.exists() or not resolved.is_file():
            self.not_found()
            return
        content_type = mimetypes.guess_type(str(resolved))[0] or "application/octet-stream"
        content = resolved.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def not_found(self):
        self.send_json({"error": "Không tìm thấy."}, status=404)


def main():
    ensure_storage()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), FamilyHandler)
    print(f"Gia phả đang chạy tại http://127.0.0.1:{port}")
    print(f"Trang admin: http://127.0.0.1:{port}/admin")
    print("Admin cần đặt FAMILY_ADMIN_PASSWORD trước khi đăng nhập.")
    server.serve_forever()


if __name__ == "__main__":
    main()
