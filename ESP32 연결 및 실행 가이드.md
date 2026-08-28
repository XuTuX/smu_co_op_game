# ESP32 자체 Wi-Fi 연결 및 실행 전체 가이드

이 문서는 현재 연결된 **ESP32-S3(플래시 16MB, PSRAM 8MB)**를 기준으로 설명합니다. ESP32가 `hihi` Wi-Fi와 웹페이지를 모두 직접 제공하므로 실제 플레이에는 Node.js 서버가 필요하지 않습니다.

> **최종 적용 완료 — 2026-08-28:** 현재 보드에 직접 HTTP/WebSocket 펌웨어와 전체 LittleFS 웹 파일을 모두 업로드했습니다. 두 업로드 모두 `SUCCESS`와 해시 검증을 통과했습니다. 이제 사용자는 `hihi`에 연결하고 `http://192.168.4.1`을 열기만 하면 됩니다.

## 1. 현재 설정

| 항목 | 값 |
|---|---|
| Wi-Fi 이름 | `hihi` |
| Wi-Fi 비밀번호 | `12345678` |
| 접속 주소 | `http://192.168.4.1` |
| WebSocket | `ws://192.168.4.1:81` |
| 현재 버튼 | GPIO 4 버튼 1개 |
| 현재 모드 | `SINGLE_BUTTON_TEST_MODE 1` |
| 웹 파일 저장 위치 | ESP32 LittleFS 9.4MB 영역 |

```text
[GPIO 4 버튼]
      ↓
[ESP32-S3]
      ├─ hihi Wi-Fi 생성
      ├─ 192.168.4.1:80 웹페이지 제공
      ├─ 192.168.4.1:81 버튼 입력 전송
      └─ 게임·이미지를 내부 플래시에 저장
      ↓
[hihi에 연결한 PC 또는 휴대폰 브라우저]
```

외부 공유기, 인터넷, 컴퓨터 IP, Node.js 서버는 필요하지 않습니다.

---

## 2. GPIO 4 버튼 배선

펌웨어가 `INPUT_PULLUP`을 사용하므로 외부 저항 없이 연결합니다.

```text
ESP32 GPIO 4 ───── [버튼] ───── ESP32 GND
```

| 버튼 상태 | GPIO | 웹 표시 | 전송 값 |
|---|---|---|---|
| 떼고 있음 | `HIGH` | 버튼 떼짐 | `forward: false` |
| 누르고 있음 | `LOW` | 버튼 눌림 | `forward: true` |

4핀 택트 스위치는 같은 쪽의 두 다리가 내부적으로 연결된 경우가 많습니다. 스위치를 브레드보드 중앙 홈을 가로질러 꽂고 서로 반대쪽 다리를 GPIO 4와 GND에 연결합니다.

---

## 3. 처음 사용할 때 업로드

ESP32를 데이터 통신 가능한 USB 케이블로 컴퓨터에 연결합니다.

프로젝트 폴더로 이동합니다.

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot"
```

### 1단계: 펌웨어 업로드

```bash
pio run -e esp32-s3-devkitm-1 -t upload --upload-port /dev/cu.usbmodem5B8E0625791
```

이 단계에서 다음 항목이 설치됩니다.

- ESP32 자체 Wi-Fi AP
- HTTP 서버
- WebSocket 서버
- GPIO 버튼 입력 처리
- 16MB 플래시 파티션 구성
- 웹 파일이 없을 때 표시할 기본 GPIO 4 페이지

### 2단계: 전체 웹 파일 업로드

```bash
pio run -e esp32-s3-devkitm-1 -t uploadfs --upload-port /dev/cu.usbmodem5B8E0625791
```

이 단계에서 다음 파일들이 LittleFS에 올라갑니다.

- GPIO 4 상세 테스트 페이지
- 버스 주차 게임
- 장애물 피하기 게임
- CSS와 JavaScript
- 캐릭터 PNG 이미지

웹 파일은 약 4.9MB이며 업로드에 2~3분 정도 걸릴 수 있습니다. 업로드 도중 ESP32의 RESET 또는 EN 버튼을 누르거나 USB 케이블을 뽑지 않습니다.

`SUCCESS`와 `Hash of data verified`가 표시되면 완료된 것입니다.

### 업로드가 끊기는 경우

현재 S3 환경은 안정성을 위해 `upload_speed = 460800`으로 설정되어 있습니다. 그래도 `Connecting...`에서 멈추면 다음 순서를 사용합니다.

1. `BOOT` 버튼을 누르고 유지합니다.
2. `RESET` 또는 `EN` 버튼을 짧게 누릅니다.
3. 업로드가 시작되면 `BOOT` 버튼을 놓습니다.

---

## 4. ESP32 Wi-Fi 연결

업로드가 끝나면 ESP32가 자동으로 재시작하고 다음 Wi-Fi를 만듭니다.

```text
이름: hihi
비밀번호: 12345678
```

PC 또는 휴대폰에서 `hihi`를 선택합니다. 이 네트워크는 인터넷 연결용이 아니므로 **인터넷 없음** 경고가 나타나도 연결을 유지합니다.

특히 Mac이 기존 인터넷 Wi-Fi로 자동 복귀할 수 있으므로 브라우저를 열기 전에 현재 Wi-Fi가 실제로 `hihi`인지 다시 확인합니다.

---

## 5. 웹페이지 접속

`hihi`에 연결한 기기의 브라우저 주소창에 다음 주소를 입력합니다.

```text
http://192.168.4.1
```

`https://`가 아니라 반드시 `http://`를 사용합니다.

현재 단일 버튼 모드에서는 루트 주소가 GPIO 4 테스트 페이지를 표시합니다.

| 페이지 | 주소 |
|---|---|
| GPIO 4 테스트 | `http://192.168.4.1` |
| GPIO 4 상세 테스트 | `http://192.168.4.1/button-test.html` |
| 버스 주차 | `http://192.168.4.1/index.html` |
| 장애물 피하기 | `http://192.168.4.1/traffic.html` |

일부 휴대폰이나 PC에서는 `hihi` 연결 직후 로그인 페이지처럼 ESP32 화면이 자동으로 열릴 수도 있습니다.

---

## 6. GPIO 4 테스트 방법

1. `hihi`에 연결합니다.
2. `http://192.168.4.1`을 엽니다.
3. 화면에 `ESP32 연결됨`이 표시되는지 확인합니다.
4. GPIO 4 버튼을 누릅니다.
5. 화면이 초록색으로 바뀌고 `버튼 눌림!`이 표시되는지 확인합니다.
6. 버튼을 놓았을 때 `버튼 떼짐`으로 돌아오는지 확인합니다.

상세 테스트 페이지에서는 다음 정보도 볼 수 있습니다.

- 버튼 누른 횟수
- 수신한 패킷 수
- 마지막 입력 시간
- `INPUT_PULLUP · HIGH/LOW`
- `forward: true/false` 입력 기록

---

## 7. 게임에서 GPIO 4 버튼 역할

현재 버튼 하나만 연결된 상태에서는 GPIO 4가 P1 입력입니다.

| 페이지 | GPIO 4 동작 |
|---|---|
| 버튼 테스트 | 누름과 해제 표시 |
| 버스 주차 | 전진 가속 |
| 장애물 피하기 | 위쪽 이동 |

전체 게임의 준비 확인은 버튼 4개를 기준으로 하므로 현재는 GPIO 4 테스트 페이지를 사용하는 것이 가장 편리합니다.

---

## 8. 펌웨어 또는 웹페이지를 수정한 뒤 다시 올리는 방법

### `src/main.cpp`만 수정한 경우

펌웨어만 다시 업로드합니다.

```bash
pio run -e esp32-s3-devkitm-1 -t upload --upload-port /dev/cu.usbmodem5B8E0625791
```

### HTML, CSS, JavaScript 또는 이미지를 수정한 경우

웹 파일만 다시 업로드합니다.

```bash
pio run -e esp32-s3-devkitm-1 -t uploadfs --upload-port /dev/cu.usbmodem5B8E0625791
```

### 펌웨어와 웹페이지를 모두 수정한 경우

두 명령을 순서대로 각각 실행합니다.

---

## 9. 시리얼 모니터 확인

```bash
pio device monitor --port /dev/cu.usbmodem5B8E0625791 --baud 115200
```

정상 부팅 로그 예시는 다음과 같습니다.

```text
[BUTTON TEST] Single-button mode enabled: GPIO 4 -> Forward/P1
[WiFi AP] ESP32 access point started
[WiFi AP] SSID: hihi
[WiFi AP] ESP32 IP: 192.168.4.1
[WiFi AP] WebSocket: ws://192.168.4.1:81
[HTTP] LittleFS mounted: ... bytes used
[HTTP] Open http://192.168.4.1 in a browser
```

브라우저가 연결되면 다음 로그가 추가됩니다.

```text
[WiFi AP] Connected station(s): 1
[WS] Client #0 connected from 192.168.4.2 (1 client(s))
```

버튼 입력 로그:

```text
[BUTTON] Button 'Forward' PRESSED (GPIO 4)
[INPUT SENT] FWD: 1 | BWD: 0 | LFT: 0 | RGT: 0
[BUTTON] Button 'Forward' RELEASED (GPIO 4)
[INPUT SENT] FWD: 0 | BWD: 0 | LFT: 0 | RGT: 0
```

시리얼 모니터를 종료할 때는 `Ctrl+C`를 누릅니다. 업로드 전에는 시리얼 모니터를 닫아야 합니다.

---

## 10. 버튼 4개 모드로 변경

버튼 4개가 준비되면 `src/main.cpp`에서 다음 값을 변경합니다.

```cpp
#define SINGLE_BUTTON_TEST_MODE 0
```

ESP32-S3 핀 배치는 다음과 같습니다.

| 역할 | GPIO | 반대쪽 |
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

변경 후 펌웨어만 다시 업로드하면 됩니다. 웹 파일은 바뀌지 않았으므로 `uploadfs`를 반복할 필요가 없습니다.

4개 버튼 모드에서는 `http://192.168.4.1`이 버스 주차 페이지를 기본 화면으로 엽니다.

---

## 11. 문제 해결

### `hihi`는 보이지만 `192.168.4.1`이 열리지 않음

- PC나 휴대폰이 실제로 `hihi`에 연결됐는지 다시 확인합니다.
- 기존 Wi-Fi 또는 모바일 데이터로 자동 전환되지 않았는지 확인합니다.
- 주소가 `http://192.168.4.1`인지 확인합니다. `https://`는 동작하지 않습니다.
- ESP32의 RESET 또는 EN 버튼을 한 번 누르고 5초 후 다시 접속합니다.
- VPN이나 프록시를 잠시 끄고 다시 시도합니다.
- `ping 192.168.4.1`로 연결을 확인합니다.

### 기본 페이지는 열리지만 CSS 또는 게임 이미지가 없음

펌웨어만 올라가고 LittleFS 웹 파일이 올라가지 않은 상태입니다. 다음 명령을 다시 실행합니다.

```bash
pio run -e esp32-s3-devkitm-1 -t uploadfs --upload-port /dev/cu.usbmodem5B8E0625791
```

### 화면에 연결 끊김이 표시됨

- 페이지를 새로고침합니다.
- `hihi` 연결을 유지합니다.
- 다른 기기가 너무 많이 연결돼 있지 않은지 확인합니다. 현재 최대 연결 수는 4대입니다.
- ESP32를 재시작한 후 다시 접속합니다.

### 버튼이 반응하지 않음

- 버튼이 GPIO 4와 GND 사이에 연결됐는지 확인합니다.
- `SINGLE_BUTTON_TEST_MODE`가 `1`인지 확인합니다.
- 시리얼 로그에 `PRESSED (GPIO 4)`가 나타나는지 확인합니다.
- 펌웨어 변경 후 `upload`를 다시 했는지 확인합니다.

### 버튼이 계속 눌린 상태임

- GPIO 4가 GND와 직접 합선되지 않았는지 확인합니다.
- 4핀 택트 스위치의 같은 쪽 두 다리에 연결하지 않았는지 확인합니다.
- 스위치를 브레드보드 중앙 홈을 가로질러 다시 장착합니다.

### 업로드 포트를 찾지 못함

```bash
pio device list
```

- 데이터 USB 케이블인지 확인합니다.
- 시리얼 모니터를 닫습니다.
- USB 케이블을 다시 연결합니다.
- 포트가 바뀌었다면 업로드 명령의 `/dev/cu.usbmodem...` 부분을 새 포트로 바꿉니다.

### 대용량 `uploadfs`가 중간에 끊김

- ESP32와 컴퓨터를 직접 USB로 연결합니다.
- USB 허브를 제거합니다.
- RESET 버튼을 업로드 중에 누르지 않습니다.
- `platformio.ini`의 S3 `upload_speed`를 `460800` 이하로 유지합니다.
- 실패한 경우 같은 `uploadfs` 명령을 다시 실행하면 됩니다.

---

## 12. Node.js 서버는 언제 필요한가

실제 ESP32 사용에는 필요하지 않습니다. ESP32 없이 키보드와 화면 버튼으로 PC 개발 테스트를 할 때만 선택적으로 사용합니다.

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot/server"
npm install
npm start
```

그때만 `http://localhost:3000`을 사용합니다. 실제 ESP32 직접 사용 주소는 항상 `http://192.168.4.1`입니다.

---

## 13. 빠른 실행 요약

펌웨어와 웹 파일이 이미 업로드되어 있다면 매번 필요한 과정은 세 단계뿐입니다.

1. ESP32 전원을 켭니다.
2. PC 또는 휴대폰을 `hihi`에 연결합니다.
3. 브라우저에서 `http://192.168.4.1`을 엽니다.

Node.js 실행이나 `localhost:3000` 접속은 필요하지 않습니다.

---

## 14. 최종 점검표

### 이미 완료된 항목

- [x] 연결된 보드가 ESP32-S3임을 확인함
- [x] 실제 플래시 16MB와 PSRAM 8MB를 확인함
- [x] GPIO 4 단일 버튼 모드 펌웨어를 적용함
- [x] 직접 HTTP 서버 `192.168.4.1:80`을 적용함
- [x] 직접 WebSocket 서버 `192.168.4.1:81`을 적용함
- [x] 16MB용 파티션 구성을 업로드함
- [x] 펌웨어 `upload`가 성공함
- [x] 전체 웹 파일 `uploadfs`가 성공함
- [x] LittleFS 이미지 해시 검증이 성공함
- [x] GPIO 테스트·주차·장애물 페이지를 ESP32에 저장함

### 사용할 때 확인할 항목

- [ ] ESP32-S3 전원이 켜져 있음
- [ ] 버튼이 GPIO 4와 GND 사이에 연결됨
- [ ] PC 또는 휴대폰이 `hihi`에 연결됨
- [ ] 인터넷 없음 경고에도 `hihi` 연결을 유지함
- [ ] `http://192.168.4.1`을 HTTP로 열었음
- [ ] 화면에 ESP32 연결됨이 표시됨
- [ ] 버튼 누름과 해제가 화면에 반영됨

현재 보드에는 직접 웹서버 펌웨어와 전체 LittleFS 웹 파일 업로드가 완료되어 있습니다. 평소에는 Node.js나 `npm start` 없이 ESP32 전원, `hihi` 연결, `http://192.168.4.1` 접속만 하면 됩니다.
