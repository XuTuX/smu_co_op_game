# ESP32 연결 및 실행 전체 가이드

이 문서는 현재 프로젝트를 기준으로 ESP32 펌웨어 업로드부터 자체 Wi-Fi 연결, Node.js 서버 실행, GPIO 4 버튼 하나 테스트, 게임 실행, 나중에 버튼 4개로 전환하는 과정까지 순서대로 설명합니다.

현재 기본 설정은 다음과 같습니다.

| 항목 | 현재 값 |
|---|---|
| 네트워크 방식 | ESP32 자체 Wi-Fi AP(SoftAP) |
| Wi-Fi 이름 | `hihi` |
| Wi-Fi 비밀번호 | `12345678` |
| ESP32 고정 IP | `192.168.4.1` |
| ESP32 WebSocket | `ws://192.168.4.1:81` |
| PC 웹 서버 | `http://localhost:3000` |
| 현재 버튼 구성 | GPIO 4 버튼 1개 |
| 현재 버튼 역할 | P1 전진 / 장애물 게임 위쪽 이동 |
| 펌웨어 설정 | `SINGLE_BUTTON_TEST_MODE 1` |

> 현재는 버튼 한 개만 사용할 수 있도록 설정되어 있습니다. 버튼 4개가 준비되면 이 문서의 **버튼 4개 모드로 전환하기** 절을 따라 설정을 바꾸면 됩니다.

---

## 1. 전체 작동 구조

```text
[GPIO 4 버튼]
      ↓ INPUT_PULLUP 입력
[ESP32]
      ├─ 자체 Wi-Fi 생성: hihi
      └─ WebSocket 서버: 192.168.4.1:81
                    ↑
                    │ PC가 ESP32에 접속
[Node.js 서버가 실행 중인 컴퓨터]
      ├─ ESP32 버튼 입력 수신
      ├─ 브라우저로 실시간 중계
      └─ 웹 페이지 제공: localhost:3000
                    ↓
[브라우저 테스트 페이지 또는 게임]
```

예전처럼 ESP32와 컴퓨터를 외부 공유기에 연결하거나, 컴퓨터의 내부 IP를 펌웨어에 입력할 필요가 없습니다. ESP32가 직접 `hihi`라는 2.4GHz Wi-Fi를 만들고 컴퓨터가 그 Wi-Fi에 접속합니다.

웹 페이지와 게임 파일은 ESP32가 아니라 컴퓨터의 Node.js 서버에서 제공합니다. 따라서 플레이할 때는 ESP32와 Node.js 서버가 실행 중인 컴퓨터가 모두 필요합니다.

---

## 2. 준비물

현재 GPIO 4 버튼 하나만 시험할 때 필요한 준비물입니다.

- ESP32 개발 보드 1개
  - 일반 ESP32 DevKit / ESP32-WROOM-32 또는
  - ESP32-S3 DevKitM-1
- 순간 누름 방식 푸시 버튼 또는 택트 스위치 1개
- 점퍼 케이블 2개 이상
- 브레드보드(선택 사항)
- 데이터 통신이 가능한 USB 케이블
- Node.js와 PlatformIO가 설치된 컴퓨터

외부 Wi-Fi 공유기는 필요하지 않습니다.

> 충전 전용 USB 케이블은 전원만 공급하고 업로드용 포트를 만들지 못합니다. 반드시 데이터 통신이 가능한 USB 케이블을 사용합니다.

---

## 3. GPIO 4 버튼 하나 배선하기

현재 펌웨어는 ESP32 내부의 `INPUT_PULLUP` 기능을 사용합니다. 외부 저항 없이 버튼 한쪽을 GPIO 4에, 반대쪽을 GND에 연결하면 됩니다.

```text
ESP32 GPIO 4 ───── [버튼] ───── ESP32 GND
```

입력 상태는 다음과 같습니다.

| 버튼 상태 | GPIO 입력 | 웹 페이지 표시 | 전송 값 |
|---|---|---|---|
| 버튼을 떼고 있음 | `HIGH` | 버튼 떼짐 | `forward: false` |
| 버튼을 누름 | `LOW` | 버튼 눌림 | `forward: true` |

### 4핀 택트 스위치를 사용할 때

4핀 택트 스위치는 같은 방향의 두 다리가 내부적으로 이미 연결된 경우가 많습니다. GPIO와 GND를 같은 쪽 다리에 연결하면 버튼을 누르지 않아도 계속 눌린 상태가 될 수 있습니다.

브레드보드의 중앙 홈을 가로질러 스위치를 장착하고 서로 반대편에 있는 다리 하나씩을 GPIO 4와 GND에 연결하는 방법이 안전합니다.

```text
GPIO 4 ─── [스위치 한쪽]   [스위치 반대쪽] ─── GND
```

---

## 4. 현재 단일 버튼 펌웨어 설정

PlatformIO용 펌웨어는 `src/main.cpp`, Arduino IDE용 펌웨어는 `esp32/esp32_bus_controller.ino`에 있습니다. 두 파일의 주요 설정은 동일합니다.

```cpp
const char* AP_SSID     = "hihi";
const char* AP_PASSWORD = "12345678";
const uint16_t WEBSOCKET_PORT = 81;

#define SINGLE_BUTTON_TEST_MODE 1
```

- `AP_SSID`: ESP32가 만들 Wi-Fi 이름
- `AP_PASSWORD`: Wi-Fi 접속 비밀번호. WPA2 사용 시 8자 이상이어야 합니다.
- `WEBSOCKET_PORT`: ESP32 버튼 데이터를 전송하는 WebSocket 포트
- `SINGLE_BUTTON_TEST_MODE 1`: 보드 종류와 관계없이 전진/P1 버튼을 GPIO 4로 읽는 현재 테스트 모드

현재는 `SINGLE_BUTTON_TEST_MODE`를 `1`로 유지합니다.

---

## 5. 최초 한 번 서버 패키지 설치하기

Node.js 패키지는 인터넷 연결이 가능한 상태에서 먼저 설치해야 합니다. 컴퓨터를 `hihi`에 연결하면 인터넷이 끊길 수 있으므로, 처음 한 번의 `npm install`은 일반 인터넷 Wi-Fi에 연결된 상태에서 실행하는 것이 좋습니다.

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot/server"
npm install
```

이미 `server/node_modules`가 설치되어 있다면 이후 실행에서는 `npm install`을 반복할 필요가 없습니다.

---

## 6. ESP32 USB 연결 확인

ESP32를 USB 케이블로 컴퓨터에 연결한 후 프로젝트 폴더에서 다음 명령을 실행합니다.

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot"
pio device list
```

정상적으로 인식되면 다음과 비슷한 포트가 표시됩니다.

```text
/dev/cu.usbmodem...
/dev/cu.usbserial-...
/dev/cu.SLAB_USBtoUART
/dev/cu.wchusbserial...
```

포트가 보이지 않으면 다음을 확인합니다.

- 데이터 통신이 가능한 USB 케이블인지 확인
- 다른 USB 케이블 또는 USB 포트 사용
- USB 허브를 제거하고 컴퓨터에 직접 연결
- 보드 전원 LED 확인
- CP210x, CH340 또는 CH343 드라이버가 필요한 보드인지 확인
- 다른 시리얼 모니터 프로그램이 포트를 사용 중인지 확인

---

## 7. PlatformIO로 펌웨어 업로드하기

먼저 프로젝트 루트로 이동합니다.

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot"
```

사용 중인 보드에 맞는 명령 하나만 실행합니다.

### 일반 ESP32 DevKit / ESP32-WROOM-32

```bash
pio run -e esp32dev -t upload
```

### ESP32-S3 DevKitM-1

```bash
pio run -e esp32-s3-devkitm-1 -t upload
```

자동으로 포트를 선택하지 못하면 포트를 직접 지정할 수 있습니다.

```bash
pio run -e esp32-s3-devkitm-1 -t upload --upload-port /dev/cu.usbmodem...
```

### 업로드가 `Connecting...`에서 멈출 때

1. ESP32의 `BOOT` 버튼을 누르고 유지합니다.
2. `RESET` 또는 `EN` 버튼을 짧게 한 번 누릅니다.
3. 업로드가 시작되면 `BOOT` 버튼을 놓습니다.
4. 업로드 완료 후 필요하면 `RESET` 또는 `EN` 버튼을 한 번 누릅니다.

---

## 8. Arduino IDE로 업로드하는 경우

PlatformIO 대신 Arduino IDE를 사용할 때만 이 절을 따릅니다.

1. `esp32/esp32_bus_controller.ino` 파일을 엽니다.
2. 라이브러리 매니저에서 다음 라이브러리를 설치합니다.
   - `WebSockets` by Markus Sattler
   - `ArduinoJson` by Benoit Blanchon
3. 보드 메뉴에서 실제 보드에 맞게 `ESP32 Dev Module` 또는 ESP32-S3 보드를 선택합니다.
4. ESP32가 연결된 직렬 포트를 선택합니다.
5. 업로드 버튼을 누릅니다.

PlatformIO를 사용한다면 `.ino` 파일을 따로 수정하거나 업로드할 필요가 없습니다.

---

## 9. 시리얼 모니터 확인하기

업로드가 끝난 후 다음 명령으로 시리얼 모니터를 엽니다.

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot"
pio device monitor -b 115200
```

현재 단일 버튼 모드에서는 다음과 비슷한 로그가 나타납니다.

```text
[BUTTON TEST] Single-button mode enabled: GPIO 4 -> Forward/P1
   👉 Forward: GPIO 4 (INPUT_PULLUP)
[WiFi AP] ESP32 access point started
[WiFi AP] SSID: hihi
[WiFi AP] Password: 12345678
[WiFi AP] ESP32 IP: 192.168.4.1
[WiFi AP] WebSocket: ws://192.168.4.1:81
```

버튼을 누르고 놓으면 다음 로그가 나타나야 합니다.

```text
[BUTTON] Button 'Forward' PRESSED (GPIO 4)
[INPUT SENT] FWD: 1 | BWD: 0 | LFT: 0 | RGT: 0
[BUTTON] Button 'Forward' RELEASED (GPIO 4)
[INPUT SENT] FWD: 0 | BWD: 0 | LFT: 0 | RGT: 0
```

Node.js 서버가 ESP32에 연결되면 다음과 비슷한 로그도 나타납니다.

```text
[WiFi AP] Connected station(s): 1
[WS] Client #0 connected from 192.168.4.2 (1 client(s))
```

시리얼 모니터를 종료할 때는 `Ctrl+C`를 누릅니다. 펌웨어 업로드 전에 시리얼 모니터를 닫아야 포트 사용 충돌을 피할 수 있습니다.

---

## 10. 컴퓨터를 ESP32 자체 Wi-Fi에 연결하기

펌웨어가 실행되면 ESP32가 다음 Wi-Fi를 만듭니다.

```text
Wi-Fi 이름: hihi
비밀번호: 12345678
```

컴퓨터의 Wi-Fi 설정에서 `hihi`를 선택하고 비밀번호를 입력합니다.

이 Wi-Fi는 인터넷 접속용이 아닙니다. macOS 또는 Windows에서 **인터넷 연결 없음** 경고가 나타나도 `hihi` 연결을 유지합니다. 운영체제가 자동으로 기존 인터넷 Wi-Fi로 돌아가면 ESP32와 연결할 수 없으므로 현재 연결이 계속 `hihi`인지 확인합니다.

ESP32의 주소는 항상 `192.168.4.1`입니다. 원하면 터미널에서 연결을 확인할 수 있습니다.

```bash
ping 192.168.4.1
```

`Ctrl+C`를 누르면 ping을 종료합니다.

---

## 11. Node.js 서버 실행하기

컴퓨터가 `hihi`에 연결된 상태에서 새 터미널을 열고 실행합니다.

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot/server"
npm start
```

정상적으로 시작하면 다음 내용이 표시됩니다.

```text
🚌 ESP32 Cooperative Bus Parking Game Server Started!
🌐 Local Web Game URL: http://localhost:3000
📡 ESP32 AP: connect this computer to Wi-Fi "hihi"
🔌 ESP32 WebSocket: ws://192.168.4.1:81
```

ESP32와 WebSocket 연결이 완료되면 다음 로그가 나타납니다.

```text
[ESP32 AP] WebSocket connected: ws://192.168.4.1:81
```

ESP32가 아직 켜지지 않았거나 컴퓨터가 `hihi`에 연결되지 않았다면 서버는 연결을 다시 시도합니다. ESP32 연결 후 서버를 반드시 재시작할 필요는 없습니다.

서버를 종료할 때는 서버 터미널에서 `Ctrl+C`를 누릅니다.

---

## 12. GPIO 4 버튼 테스트 페이지 사용하기

서버가 실행 중일 때 Chrome 또는 Edge에서 다음 주소를 엽니다.

```text
http://localhost:3000/button-test.html
```

또는 화면 위쪽의 **03 GPIO 4 버튼 테스트** 메뉴를 선택합니다.

테스트 페이지에서는 다음 항목을 확인할 수 있습니다.

- ESP32 연결 여부
- GPIO 4 버튼 누름과 해제
- `INPUT_PULLUP`의 `HIGH` / `LOW` 상태
- 버튼을 누른 횟수
- 수신한 입력 패킷 수
- 마지막 입력 수신 시간
- `forward: true` / `forward: false` 실시간 기록

버튼을 떼고 있을 때는 `INPUT_PULLUP · HIGH`, `버튼 떼짐`, `forward: false`가 표시됩니다.

버튼을 누르고 있을 때는 `INPUT_PULLUP · LOW`, `버튼 눌림!`, `forward: true`가 표시되며 큰 상태 영역이 초록색으로 바뀝니다.

---

## 13. 게임 페이지 실행하기

같은 서버에서 다음 페이지를 사용할 수 있습니다.

| 페이지 | 주소 |
|---|---|
| 버스 주차 게임 | `http://localhost:3000` |
| 장애물 피하기 | `http://localhost:3000/traffic.html` |
| GPIO 4 버튼 테스트 | `http://localhost:3000/button-test.html` |

현재 버튼 하나만 연결된 상태에서는 GPIO 4가 다음 역할을 합니다.

| 페이지 | GPIO 4 버튼 동작 |
|---|---|
| 버스 주차 | 전진 가속 |
| 장애물 피하기 | 위쪽 이동 |
| 버튼 테스트 | 누름·해제 상태 표시 |

버스 주차와 장애물 피하기 게임의 전체 준비 과정은 버튼 4개를 기준으로 만들어져 있으므로, 지금은 `button-test.html`에서 하드웨어 입력을 확인하는 것이 가장 편리합니다.

---

## 14. 버튼 4개 모드로 전환하기

버튼 4개가 준비되면 PlatformIO의 `src/main.cpp` 또는 Arduino IDE의 `.ino` 파일에서 다음 값을 변경합니다.

```cpp
#define SINGLE_BUTTON_TEST_MODE 0
```

변경 후 펌웨어를 다시 빌드하고 업로드합니다.

### 일반 ESP32 DevKit / ESP32-WROOM-32 핀 배치

| 역할 | GPIO | 버튼 반대쪽 |
|---|---:|---|
| P1 전진 | GPIO 25 | GND |
| P2 후진 / 브레이크 | GPIO 26 | GND |
| P3 왼쪽 | GPIO 27 | GND |
| P4 오른쪽 | GPIO 14 | GND |

```text
GPIO 25 ─── [전진 버튼] ─── GND
GPIO 26 ─── [후진 버튼] ─── GND
GPIO 27 ─── [왼쪽 버튼] ─── GND
GPIO 14 ─── [오른쪽 버튼] ─ GND
```

### ESP32-S3 DevKitM-1 핀 배치

| 역할 | GPIO | 버튼 반대쪽 |
|---|---:|---|
| P1 전진 | GPIO 4 | GND |
| P2 후진 / 브레이크 | GPIO 5 | GND |
| P3 왼쪽 | GPIO 6 | GND |
| P4 오른쪽 | GPIO 7 | GND |

```text
GPIO 4 ─── [전진 버튼] ─── GND
GPIO 5 ─── [후진 버튼] ─── GND
GPIO 6 ─── [왼쪽 버튼] ─── GND
GPIO 7 ─── [오른쪽 버튼] ─ GND
```

### 공통 GND 연결

ESP32의 GND 하나를 브레드보드 GND 레일에 연결하고 네 버튼의 반대쪽을 모두 같은 GND 레일에 연결할 수 있습니다.

```text
ESP32 GND ─── 브레드보드 GND 레일
                  ├── 전진 버튼
                  ├── 후진 버튼
                  ├── 왼쪽 버튼
                  └── 오른쪽 버튼
```

버튼 4개 모드에서는 전진+왼쪽, 후진+오른쪽 같은 동시 입력도 지원합니다.

---

## 15. 문제 해결

### `hihi` Wi-Fi가 보이지 않는 경우

- ESP32에 전원이 들어와 있는지 확인합니다.
- 시리얼 모니터에서 `[WiFi AP] ESP32 access point started` 로그를 확인합니다.
- ESP32의 `RESET` 또는 `EN` 버튼을 한 번 누릅니다.
- 컴퓨터의 Wi-Fi 목록을 새로고침합니다.
- 펌웨어의 `AP_SSID`가 `hihi`인지 확인합니다.
- 잘못된 보드 환경으로 펌웨어를 업로드하지 않았는지 확인합니다.

### `npm install`이 실패하는 경우

- `hihi`는 인터넷이 없는 네트워크이므로 일반 인터넷 Wi-Fi로 잠시 돌아갑니다.
- 인터넷 연결 상태에서 `server` 폴더의 `npm install`을 완료합니다.
- 설치가 끝난 후 다시 `hihi`에 연결합니다.
- 이후에는 일반적으로 `npm start`만 실행하면 됩니다.

### 테스트 페이지가 열리지 않는 경우

- Node.js 서버 터미널이 계속 실행 중인지 확인합니다.
- 브라우저 주소가 `http://localhost:3000/button-test.html`인지 확인합니다.
- 서버에 `EADDRINUSE` 오류가 있으면 3000번 포트를 다른 프로그램이 사용 중인 것입니다.
- 웹 서버 포트만 바꾸려면 `PORT=3001 npm start`로 실행합니다.
- 이 경우 브라우저 주소는 `http://localhost:3001/button-test.html`입니다. ESP32 WebSocket 포트 `81`은 바꾸지 않습니다.

### 페이지에 `ESP32 연결 대기`가 계속 표시되는 경우

- 컴퓨터 Wi-Fi가 실제로 `hihi`에 연결되어 있는지 확인합니다.
- 인터넷 없음 경고 때문에 다른 Wi-Fi로 자동 전환되지 않았는지 확인합니다.
- `ping 192.168.4.1`이 응답하는지 확인합니다.
- Node.js 서버 로그에 `[ESP32 AP] WebSocket connected`가 나타나는지 확인합니다.
- ESP32 시리얼 로그에 `[WS] Client #0 connected`가 나타나는지 확인합니다.
- 컴퓨터 방화벽이나 보안 프로그램이 `192.168.4.1`의 포트 `81`을 막고 있지 않은지 확인합니다.

### ESP32는 연결됐지만 버튼이 반응하지 않는 경우

- 현재 펌웨어에 `#define SINGLE_BUTTON_TEST_MODE 1`이 설정되어 있는지 확인합니다.
- 버튼이 GPIO 4와 GND 사이에 연결되어 있는지 확인합니다.
- GPIO 4 대신 보드에 인쇄된 다른 번호에 연결하지 않았는지 확인합니다.
- 시리얼 모니터에 `PRESSED (GPIO 4)`와 `RELEASED (GPIO 4)`가 나타나는지 확인합니다.
- 펌웨어를 수정한 후 다시 업로드했는지 확인합니다.

### 버튼이 계속 눌린 상태로 표시되는 경우

- GPIO 4 선이 GND와 직접 닿아 있지 않은지 확인합니다.
- 4핀 택트 스위치의 이미 연결된 같은 쪽 다리 두 개에 GPIO와 GND를 연결하지 않았는지 확인합니다.
- 스위치를 브레드보드 중앙 홈을 가로질러 다시 장착합니다.
- 점퍼 케이블의 피복 손상이나 합선을 확인합니다.

### 시리얼 로그에는 입력이 보이지만 웹 페이지가 바뀌지 않는 경우

- `[INPUT SENT]` 로그가 나타나는지 확인합니다. WebSocket 클라이언트가 없으면 펌웨어는 입력을 전송하지 않습니다.
- ESP32 시리얼 로그의 연결된 client 수가 `1` 이상인지 확인합니다.
- Node.js 서버와 브라우저를 새로 시작합니다.
- 브라우저 개발자 콘솔에 WebSocket 오류가 있는지 확인합니다.

### 업로드 포트를 열 수 없다는 오류가 발생하는 경우

- 실행 중인 시리얼 모니터를 `Ctrl+C`로 종료합니다.
- Arduino IDE의 시리얼 모니터도 닫습니다.
- USB 케이블을 다시 연결한 후 `pio device list`를 실행합니다.
- 올바른 `--upload-port`를 지정합니다.

### 연결이 자주 끊기는 경우

- 전원이 안정적인 USB 케이블을 사용합니다.
- ESP32와 컴퓨터 사이 거리를 줄입니다.
- 버튼 배선을 너무 길게 만들지 않습니다.
- 긴 배선이 꼭 필요하면 외부 풀업 저항이나 노이즈 제거용 커패시터 사용을 검토합니다.

---

## 16. 설정을 변경한 경우

### Wi-Fi 이름 또는 비밀번호 변경

펌웨어의 다음 값을 변경한 후 다시 업로드합니다.

```cpp
const char* AP_SSID     = "새로운_와이파이_이름";
const char* AP_PASSWORD = "8자_이상의_비밀번호";
```

컴퓨터도 변경된 Wi-Fi 이름과 비밀번호로 다시 연결해야 합니다. 서버는 SSID 자체를 사용하지 않으므로 ESP32 IP와 WebSocket 포트를 유지하면 서버 코드 변경은 필요하지 않습니다.

### ESP32 IP 또는 WebSocket 포트 변경

기본 `192.168.4.1:81`을 변경했다면 Node.js 서버 실행 시 새 주소를 지정합니다.

```bash
ESP32_WS_URL=ws://새_IP:새_포트 npm start
```

기본 설정을 유지한다면 이 환경 변수는 필요하지 않습니다.

---

## 17. 현재 GPIO 4 버튼 테스트 빠른 실행 요약

처음 한 번, 인터넷 연결 상태에서:

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot/server"
npm install
```

실제 사용할 때:

1. GPIO 4와 GND 사이에 버튼을 연결합니다.
2. ESP32를 USB로 연결합니다.
3. 보드에 맞는 명령으로 펌웨어를 업로드합니다.
4. 컴퓨터 Wi-Fi를 `hihi`에 연결합니다.
5. Node.js 서버를 실행합니다.
6. 브라우저에서 버튼 테스트 페이지를 엽니다.
7. 버튼을 누르고 떼면서 화면을 확인합니다.

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot/server"
npm start
```

```text
http://localhost:3000/button-test.html
```

---

## 18. 최종 점검표

### 지금 GPIO 4 버튼 하나를 테스트할 때

- [ ] 버튼 한쪽이 GPIO 4에 연결됨
- [ ] 버튼 반대쪽이 GND에 연결됨
- [ ] `SINGLE_BUTTON_TEST_MODE`가 `1`임
- [ ] 실제 보드에 맞는 PlatformIO 환경으로 업로드함
- [ ] 시리얼 모니터에서 ESP32 AP 시작 로그를 확인함
- [ ] 컴퓨터 Wi-Fi가 `hihi`에 연결됨
- [ ] Node.js 서버가 실행 중임
- [ ] 서버 로그에 ESP32 WebSocket 연결이 표시됨
- [ ] `button-test.html`에서 ESP32 연결됨이 표시됨
- [ ] 버튼을 누를 때 화면이 초록색으로 바뀜
- [ ] 버튼을 놓을 때 `HIGH` 상태로 돌아옴

### 나중에 버튼 4개를 사용할 때

- [ ] `SINGLE_BUTTON_TEST_MODE`를 `0`으로 변경함
- [ ] 보드 종류에 맞는 GPIO 핀을 사용함
- [ ] 네 버튼의 반대쪽을 공통 GND에 연결함
- [ ] 변경한 펌웨어를 다시 업로드함
- [ ] 네 버튼 각각의 누름과 해제를 확인함
- [ ] 전진+좌회전 등 동시 입력을 확인함

---

## 19. 현재 프로젝트 확인 상태

현재 코드 기준으로 다음 항목이 확인되어 있습니다.

- 일반 ESP32용 펌웨어 빌드 성공
- ESP32-S3용 펌웨어 빌드 성공
- ESP32 SoftAP 및 WebSocket 서버 구성 완료
- Node.js의 ESP32 자동 연결 및 재접속 구성 완료
- GPIO 4 단일 버튼 테스트 페이지 추가 완료
- 브라우저 입력 상태, 누른 횟수, 패킷 수 및 입력 기록 표시 구현 완료
- 서버·브라우저·ESP32 WebSocket 중계 자동 테스트 통과
- 버튼 4개 동시 입력 테스트 통과

실제 보드에서는 펌웨어 업로드 후 `hihi` 연결과 GPIO 4 버튼의 누름·해제를 확인하면 됩니다.
