# 🚌 Bus Co-op Club — PC 테스트 + ESP32 4인 협동 버스 게임

ESP32 마이크로컨트롤러에 연결된 4개의 물리 버튼을 이용해 4명의 플레이어가 각각 **전진 / 후진·브레이크 / 좌회전 / 우회전**을 나누어 맡는 실시간 4인 협동 아케이드 게임입니다.

현재 두 가지 버전을 제공합니다.

- **01 버스 주차:** 제한 시간 안에 목표 주차 칸에 정렬
- **02 장애물 피하기:** 캐릭터를 상하좌우로 움직여 내려오는 X 블록 회피

> ESP32가 없어도 됩니다. 서버를 실행한 뒤 브라우저에서 `WASD`/방향키 또는 화면의 컬러 버튼을 눌러 모든 기능을 먼저 테스트할 수 있습니다. 하드웨어가 연결되면 ESP32 입력이 같은 게임에 자동으로 합쳐집니다.

---

## 1. 프로젝트 구조

```text
parking-lot/
├── server/                       # Node.js 백엔드 중계 서버
│   ├── package.json              # 서버 의존성 (express, ws)
│   └── server.js                 # HTTP 정적 서빙 + WebSocket 실시간 입력 브리지
├── client/                       # 프론트엔드 웹 게임
│   ├── index.html                # 게임 UI, HUD 및 모달
│   ├── traffic.html              # 별도 낙하 장애물 피하기 게임 화면
│   ├── style.css                 # 반응형 사이버 아케이드 디자인
│   ├── traffic.css               # 장애물 피하기 전용 스타일
│   └── js/
│       ├── config.js             # 게임 설정 및 물리 상수
│       ├── bus.js                # 2D Kinematic 자전거 물리 모델 및 버스 렌더링
│       ├── map.js                # 주차장 맵, 장애물, 주차 구역 레이아웃
│       ├── collision.js          # SAT (Separating Axis Theorem) 충돌 판정
│       ├── parking.js            # 주차 성공 판정 엔진 (영역, 각도, 속도, 1초 유지)
│       ├── input.js              # 키보드(WASD) + ESP32 통합 입력 매니저
│       ├── network.js            # 웹소켓 클라이언트 및 연결 감지
│       ├── sound.js              # Web Audio API 사운드 합성기 (무설치 효과음)
│       ├── ui.js                 # 실시간 HUD 및 버튼 상태 인디케이터
│       ├── game.js               # 60FPS 주차 게임 루프 & 파티클 시스템
│       └── traffic-game.js       # 자유 이동, 낙하 장애물 생성 및 충돌
├── esp32/
│   └── esp32_bus_controller.ino  # 아두이노 IDE용 스케치 파일
├── platformio.ini                 # PlatformIO 프로젝트 설정 및 라이브러리
├── src/
│   └── main.cpp                  # PlatformIO용 C++ 펌웨어 소스
└── README.md                     # 프로젝트 종합 설명서
```

---

## 2. 하드웨어 배선 가이드 (Wiring)

ESP32 내부의 `INPUT_PULLUP`을 사용하므로 **별도의 외부 저항 없이** 버튼의 한쪽 다리를 GPIO에, 반대쪽 다리를 GND에 바로 연결합니다.

### 🔌 배선 다이어그램

```text
[ESP32 보드]                            [물리 푸시 버튼]
  GPIO PIN  ------------------------->  버튼 다리 1
    GND     ------------------------->  버튼 다리 2
```

### 📋 GPIO 핀 연결표

| 역할 | 설명 | 표준 ESP32 (DevKit / WROOM) | ESP32-S3 (DevKitM-1) |
| :--- | :--- | :---: | :---: |
| **Player 1** | **전진 (Forward)** | **GPIO 25** | **GPIO 4** |
| **Player 2** | **후진 (Backward)** | **GPIO 26** | **GPIO 5** |
| **Player 3** | **좌회전 (Turn Left)** | **GPIO 27** | **GPIO 6** |
| **Player 4** | **우회전 (Turn Right)** | **GPIO 14** | **GPIO 7** |
| **공통 GND** | 모든 버튼의 반대쪽 연결 | **GND** | **GND** |

> [!TIP]
> 핀 번호는 소스 코드 상단의 `#define PIN_FORWARD` 등에서 원하는 핀으로 언제든지 변경할 수 있습니다.

---

## 3. 빠른 시작 (서버 및 웹 게임 실행)

### 필수 프로그램
- **Node.js** (v18 이상 권장)

### 1) 서버 의존성 설치 및 실행

터미널에서 프로젝트 폴더로 이동 후 실행합니다:

```bash
# 1. 서버 폴더로 이동
cd server

# 2. 필요한 패키지 설치
npm install

# 3. 서버 시작
npm start
```

서버가 실행되면 터미널에 다음과 같은 안내가 출력됩니다:
```text
========================================================
🚌 ESP32 Cooperative Bus Parking Game Server Started!
🌐 Local Web Game URL: http://localhost:3000
📡 Use the following IP for your ESP32 configuration:
   👉 en0: http://192.168.0.15:3000 (Set SERVER_IP="192.168.0.15")
========================================================
```

### 2) 웹 브라우저 접속
- 크롬(Chrome) 또는 엣지(Edge) 브라우저에서 `http://localhost:3000` 으로 접속합니다.
- 장애물 피하기 버전은 `http://localhost:3000/traffic.html`에서 바로 열 수 있습니다.
- 같은 Wi-Fi 망에 있는 다른 컴퓨터/태블릿/스마트폰에서도 `http://<서버IP>:3000`으로 접속하여 관전할 수 있습니다.

### 3) 아두이노 없이 PC 테스트
- 첫 화면에서 **PC TEST START**를 누릅니다.
- 키보드의 `WASD` 또는 방향키를 꾹 누릅니다.
- 마우스/트랙패드/터치 기기에서는 화면 아래 컬러 컨트롤 버튼을 꾹 누릅니다.
- 전진+좌회전처럼 여러 키/버튼을 동시에 눌러 조합 입력도 확인할 수 있습니다.

---

## 4. ESP32 펌웨어 설정 및 업로드

ESP32와 컴퓨터가 **동일한 Wi-Fi 공유기(2.4GHz)**에 연결되어 있어야 합니다.

### 방법 A: PlatformIO 사용 시 (추천)

1. VSCode에서 본 프로젝트 폴더(`parking lot`)를 엽니다.
2. `src/main.cpp` 파일을 열고 Wi-Fi 및 서버 IP를 수정합니다:
   ```cpp
   const char* WIFI_SSID     = "사용중인_와이파이_이름";
   const char* WIFI_PASSWORD = "와이파이_비밀번호";
   const char* SERVER_IP     = "192.168.x.x"; // 위 서버 실행 시 터미널에 나온 컴퓨터 IP
   ```
3. VSCode 하단 PlatformIO 툴바에서 **Build (체크 표시)** 및 **Upload (화살표 표시)** 버튼을 클릭하여 업로드합니다.

---

### 방법 B: Arduino IDE 사용 시

1. Arduino IDE를 실행하고 `esp32/esp32_bus_controller.ino` 파일을 엽니다.
2. **라이브러리 매니저** (Ctrl + Shift + I 또는 Cmd + Shift + I)에서 다음 2개 라이브러리를 검색하여 설치합니다:
   - `WebSockets` by *Markus Sattler* (v2.4.1 이상)
   - `ArduinoJson` by *Benoit Blanchon* (v7.0.0 이상)
3. 코드 상단에서 본인의 Wi-Fi 정보와 컴퓨터 IP(`SERVER_IP`)를 수정합니다.
4. 보드 설정:
   - 보드: `ESP32 Dev Module` 또는 `ESP32S3 Dev Module`
   - 포트: ESP32가 연결된 COM/tty 포트 선택
5. **업로드** 버튼을 눌러 펌웨어를 굽습니다.

---

## 5. Serial Monitor 디버깅

ESP32 업로드 후 시리얼 모니터를 **115200 Baud**로 열면 다음과 같은 로그를 확인할 수 있습니다:

```text
[WiFi] Connecting to MyHomeWiFi.....
[WiFi] WiFi Connected!
[WiFi] ESP32 IP Address: 192.168.0.45
[WS] Configuring WebSocket Server -> 192.168.0.15:3000
[WS] WebSocket connected to http://192.168.0.15:3000
[WS] Sent ESP32 registration packet to server
[BUTTON] Button 'Forward' PRESSED (GPIO 25)
[INPUT SENT] FWD: 1 | BWD: 0 | LFT: 0 | RGT: 0
[BUTTON] Button 'Forward' RELEASED (GPIO 25)
[INPUT SENT] FWD: 0 | BWD: 0 | LFT: 0 | RGT: 0
```

---

## 6. 게임 조작 및 플레이 방법

### 🎮 컨트롤 (키보드 & ESP32 완전 호환)

ESP32가 없어도 키보드로 100% 테스트 및 플레이가 가능합니다!

| 플레이어 | 조작 | 키보드 키 | ESP32 버튼 | 동작 |
| :---: | :---: | :---: | :---: | :--- |
| **P1** | **전진** | `W` 또는 `↑` | Button 1 | 버스 전진 가속 |
| **P2** | **후진 / 브레이크** | `S` 또는 `↓` | Button 2 | 후진 가속 및 전진 중 브레이크 |
| **P3** | **좌회전** | `A` 또는 `←` | Button 3 | 앞바퀴를 왼쪽으로 조향 |
| **P4** | **우회전** | `D` 또는 `→` | Button 4 | 앞바퀴를 오른쪽으로 조향 |

> 💡 **동시 입력 지원:** 전진 + 좌회전, 후진 + 우회전 등 4개 버튼 동시 입력이 자연스럽게 지원됩니다.

장애물 피하기 모드에서는 같은 네 버튼을 방향 이동으로 사용합니다.

| 플레이어 | 키보드 | 장애물 피하기 역할 |
| :---: | :---: | :--- |
| **P1** | `W` 또는 `↑` | 캐릭터를 한 칸 위로 이동 |
| **P2** | `S` 또는 `↓` | 캐릭터를 한 칸 아래로 이동 |
| **P3** | `A` 또는 `←` | 캐릭터를 한 칸 왼쪽으로 이동 |
| **P4** | `D` 또는 `→` | 캐릭터를 한 칸 오른쪽으로 이동 |

장애물은 벽이나 한 줄 형태가 아니라 각각 독립된 `X` 박스로 등장합니다. 위에서는 박스가 하나씩 내려오고, 좌우에서는 X 박스가 양방향으로 번갈아 이동합니다. 기본 점수는 생존 1초마다 +10점이며, 별을 획득하면 +10점입니다. 15초마다 낙하 빈도와 이동 속도가 증가하지만 한 번에 화면을 막지 않도록 같은 열과 행의 연속 생성을 제한합니다.

---

### 🎯 주차 성공 판정 기준
1. **주차 구역 진입:** 버스의 4개 모서리가 목표 주차 칸(Target Box) 안에 진입.
2. **각도 정렬:** 주차 칸의 방향과 버스의 각도가 **±15° 이내** (전면/후면 주차 모두 인정).
3. **정지:** 버스의 이동 속도가 0에 가깝게 멈춤.
4. **정지 유지 (Dwell Time):** 단계별 요구 시간 동안 정렬 상태를 유지하면 성공 게이지가 채워지며 `+10점` 획득!

### 📈 자동 난이도 진행
- **STAGE 1 · 연습:** 버스 정면의 넓은 칸, ±30° 허용, 0.45초 정지
- **STAGE 2 · 보통:** 좌우 회전 주차, ±21° 허용, 0.75초 정지
- **STAGE 3 · 도전:** 좁은 평행 주차, ±13° 허용, 1.05초 정지

주차에 성공할 때마다 다음 단계로 올라가며, 목표 칸은 긴 문구 대신 방향과 관계없이 똑바로 보이는 `P` 아이콘으로 표시됩니다.

---

## 7. 문제 해결 (FAQ)

### Q1. 웹 화면에 "ESP32 DISCONNECTED"라고 뜹니다.
- ESP32와 서버 컴퓨터가 **동일한 Wi-Fi 네트워크**에 연결되어 있는지 확인하세요. (공유기 게스트 네트워크나 회사망은 기기 간 통신이 차단될 수 있습니다)
- `SERVER_IP`가 컴퓨터의 현재 로컬 IP(192.168.x.x)와 정확히 일치하는지 확인하세요.
- 컴퓨터 방화벽에서 포트 `3000`이 허용되어 있는지 확인하세요.

### Q2. 버튼을 누르면 반대로 동작하거나 반응이 없습니다.
- 버튼이 `GPIO PIN`과 `GND` 사이에 연결되어 있는지 확인하세요.
- 브레드보드나 점퍼선의 접촉 불량을 확인하세요.

### Q3. 서버 포트 3000번이 이미 사용 중이라는 오류가 발생합니다.
- `PORT=3001 node server.js` 명령어로 포트를 변경하여 실행할 수 있습니다 (이 경우 ESP32 코드의 `SERVER_PORT`도 3001로 변경).
# smu_co_op_game
