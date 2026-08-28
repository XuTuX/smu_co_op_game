# ESP32 연결 및 실행 가이드

이 문서는 ESP32에 물리 버튼 4개를 연결하고, 버튼 입력으로 버스 주차 게임과 장애물 피하기 게임을 조작하는 전체 과정을 설명합니다.

## 1. 전체 작동 방식

```text
물리 버튼 4개
    ↓ GPIO 입력
ESP32
    ↓ 자체 Wi-Fi AP (hihi) / WebSocket
Node.js 서버가 실행 중인 컴퓨터
    ↓ 실시간 입력 전달
브라우저 게임
```

각 버튼의 역할은 다음과 같습니다.

| 버튼 | 버스 주차 게임 | 장애물 피하기 게임 |
|---|---|---|
| 전진 | 전진 가속 | 위로 이동 |
| 후진 | 브레이크 또는 후진 | 아래로 이동 |
| 왼쪽 | 왼쪽 조향 | 왼쪽으로 이동 |
| 오른쪽 | 오른쪽 조향 | 오른쪽으로 이동 |

전진과 왼쪽처럼 여러 버튼을 동시에 누르는 것도 지원합니다.

## 2. 준비물

- ESP32 개발 보드 1개
  - 일반 ESP32 DevKit 또는 ESP32-WROOM-32
  - 또는 ESP32-S3 DevKitM-1
- 순간 누름 방식 푸시 버튼 또는 택트 스위치 4개
- 점퍼 케이블
- 브레드보드
- 데이터 통신이 가능한 USB 케이블
- Node.js가 설치된 컴퓨터
- 별도 공유기는 필요하지 않음 (ESP32가 2.4GHz Wi-Fi를 생성)

> 충전 전용 USB 케이블은 업로드용 직렬 포트가 나타나지 않을 수 있으므로 데이터 통신 지원 케이블을 사용합니다.

## 3. 버튼 배선

펌웨어에서 ESP32의 `INPUT_PULLUP` 기능을 사용하므로 외부 저항 없이 연결할 수 있습니다.

각 버튼은 한쪽을 GPIO에, 반대쪽을 GND에 연결합니다.

```text
ESP32 GPIO ───── 버튼 ───── ESP32 GND
```

버튼을 누르지 않은 상태는 `HIGH`, 버튼을 누르면 GND와 연결되어 `LOW`로 인식됩니다.

### 일반 ESP32 DevKit 또는 ESP32-WROOM-32

| 기능 | ESP32 핀 | 버튼 반대쪽 |
|---|---:|---|
| 전진 | GPIO 25 | GND |
| 후진 | GPIO 26 | GND |
| 왼쪽 | GPIO 27 | GND |
| 오른쪽 | GPIO 14 | GND |

```text
GPIO 25 ─── [전진 버튼] ─── GND
GPIO 26 ─── [후진 버튼] ─── GND
GPIO 27 ─── [왼쪽 버튼] ─── GND
GPIO 14 ─── [오른쪽 버튼] ─ GND
```

### ESP32-S3 DevKitM-1

| 기능 | ESP32-S3 핀 | 버튼 반대쪽 |
|---|---:|---|
| 전진 | GPIO 4 | GND |
| 후진 | GPIO 5 | GND |
| 왼쪽 | GPIO 6 | GND |
| 오른쪽 | GPIO 7 | GND |

```text
GPIO 4 ─── [전진 버튼] ─── GND
GPIO 5 ─── [후진 버튼] ─── GND
GPIO 6 ─── [왼쪽 버튼] ─── GND
GPIO 7 ─── [오른쪽 버튼] ─ GND
```

### GND를 공통으로 연결하는 방법

ESP32의 GND 하나를 브레드보드의 공통 접지 레일에 연결한 다음, 네 버튼의 GND 쪽 다리를 모두 그 레일에 연결하면 됩니다.

```text
ESP32 GND ─── 브레드보드 GND 레일
                  ├── 전진 버튼
                  ├── 후진 버튼
                  ├── 왼쪽 버튼
                  └── 오른쪽 버튼
```

### 4핀 택트 스위치 주의사항

일반적인 4핀 택트 스위치는 같은 방향의 두 다리가 내부적으로 연결되어 있습니다. GPIO와 GND를 이미 연결된 같은 쪽 다리에 꽂으면 버튼이 항상 눌린 것으로 인식될 수 있습니다.

스위치를 브레드보드 중앙 홈을 가로질러 장착하고, 서로 반대편 다리 하나씩을 GPIO와 GND에 연결하는 방법이 가장 안전합니다.

## 4. ESP32 자체 Wi-Fi 방식

펌웨어를 올리고 ESP32를 켜면 다음 네트워크가 생성됩니다.

```text
Wi-Fi 이름: hihi
비밀번호: 12345678
ESP32 주소: 192.168.4.1
WebSocket: ws://192.168.4.1:81
```

컴퓨터의 Wi-Fi 설정에서 `hihi`를 선택하고 비밀번호를 입력합니다. 이 네트워크는 인터넷 접속용이 아니므로 운영체제가 "인터넷 없음"을 표시해도 연결을 유지합니다.

## 5. 서버 실행

터미널을 열고 다음 명령을 실행합니다.

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot/server"
npm install
npm start
```

서버가 실행되면 다음과 비슷한 내용이 표시됩니다.

```text
Local Web Game URL: http://localhost:3000
ESP32 AP: connect this computer to Wi-Fi "hihi"
ESP32 WebSocket: ws://192.168.4.1:81
```

서버는 `192.168.4.1:81`의 ESP32에 자동으로 접속하며, 연결이 아직 안 되어 있으면 2.5초마다 다시 시도합니다. 컴퓨터 IP를 찾아서 펌웨어에 입력할 필요가 없습니다.

## 6. ESP32 펌웨어 설정

PlatformIO를 사용할 때는 프로젝트의 `src/main.cpp` 파일을 수정합니다.

```cpp
const char* AP_SSID     = "hihi";
const char* AP_PASSWORD = "12345678";
const uint16_t WEBSOCKET_PORT = 81;
```

- `AP_SSID`: ESP32가 생성할 Wi-Fi 이름
- `AP_PASSWORD`: 접속 비밀번호(8자 이상)
- `WEBSOCKET_PORT`: ESP32 입력 서버 포트(기본값 `81` 유지)

Wi-Fi 이름과 비밀번호는 대소문자를 구분합니다. AP 값을 변경하면 서버의 ESP32 주소 `192.168.4.1`은 그대로 유지됩니다.

Arduino IDE를 사용하는 경우에는 `esp32/esp32_bus_controller.ino`에서 같은 값을 수정합니다. PlatformIO를 사용할 때는 `.ino` 파일을 수정할 필요가 없습니다.

## 7. USB 연결 확인

ESP32를 USB 케이블로 컴퓨터에 연결한 뒤 다음 명령을 실행합니다.

```bash
pio device list
```

정상적으로 인식되면 `/dev/cu.usbserial-...`, `/dev/cu.SLAB_USBtoUART`, `/dev/cu.wchusbserial...` 또는 ESP32-S3 USB 장치와 비슷한 포트가 표시됩니다.

포트가 나타나지 않으면 다음 항목을 확인합니다.

- USB 케이블이 데이터 통신을 지원하는지 확인
- 다른 USB 포트 또는 케이블 사용
- 보드의 전원 LED 확인
- CP210x 또는 CH340 USB 드라이버가 필요한 보드인지 확인
- USB 허브를 빼고 컴퓨터에 직접 연결

## 8. 펌웨어 업로드

프로젝트 루트로 이동합니다.

```bash
cd "/Users/dd/Documents/PlatformIO/Projects/parking lot"
```

### 일반 ESP32에 업로드

```bash
pio run -e esp32dev -t upload
```

### ESP32-S3 DevKitM-1에 업로드

```bash
pio run -e esp32-s3-devkitm-1 -t upload
```

업로드 도중 `Connecting...`에서 진행되지 않는 일부 보드는 다음 순서로 부트로더 모드에 진입시킵니다.

1. 보드의 `BOOT` 버튼을 누르고 유지합니다.
2. `RESET` 또는 `EN` 버튼을 한 번 누릅니다.
3. 업로드가 시작되면 `BOOT` 버튼을 놓습니다.

## 9. 시리얼 모니터로 연결 상태 확인

업로드가 끝난 후 다음 명령을 실행합니다.

```bash
pio device monitor -b 115200
```

정상적으로 연결되면 다음과 비슷한 로그가 나타납니다.

```text
[WiFi AP] ESP32 access point started
[WiFi AP] SSID: hihi
[WiFi AP] Password: 12345678
[WiFi AP] ESP32 IP: 192.168.4.1
[WiFi AP] WebSocket: ws://192.168.4.1:81
[WS] Client #0 connected from 192.168.4.2 (1 client(s))
```

버튼을 누르고 놓으면 다음과 비슷한 로그가 나타납니다.

```text
[BUTTON] Button 'Forward' PRESSED (GPIO 25)
[INPUT SENT] FWD: 1 | BWD: 0 | LFT: 0 | RGT: 0
[BUTTON] Button 'Forward' RELEASED (GPIO 25)
[INPUT SENT] FWD: 0 | BWD: 0 | LFT: 0 | RGT: 0
```

시리얼 모니터를 종료할 때는 `Ctrl+C`를 누릅니다.

## 10. 게임 실행

서버가 실행 중인 상태에서 브라우저로 접속합니다.

- 버스 주차 게임: `http://localhost:3000`
- 장애물 피하기 게임: `http://localhost:3000/traffic.html`

화면에 ESP32가 연결된 것으로 표시되면 게임을 시작하고 버튼을 테스트합니다.

### 권장 테스트 순서

1. 전진 버튼을 눌렀을 때 전진하는지 확인
2. 후진 버튼을 눌렀을 때 브레이크 또는 후진하는지 확인
3. 왼쪽과 오른쪽 버튼의 방향 확인
4. 전진과 왼쪽 버튼을 동시에 눌러 동시 입력 확인
5. 모든 버튼을 놓았을 때 입력 표시가 모두 꺼지는지 확인
6. 장애물 피하기 게임에서 버튼을 한 번 누를 때 해당 방향으로 이동하는지 확인

## 11. 연결이 안 될 때 확인할 사항

### ESP32의 Wi-Fi가 보이지 않는 경우

- 시리얼 모니터에서 `[WiFi AP] ESP32 access point started` 확인
- ESP32 전원을 껐다 켠 뒤 컴퓨터의 Wi-Fi 목록 새로고침
- 컴퓨터를 ESP32 가까이 이동
- 코드의 `AP_SSID`가 `hihi`인지 확인

### `hihi`에는 연결됐지만 WebSocket 연결이 안 되는 경우

- Node.js 서버가 계속 실행 중인지 확인
- 브라우저가 아니라 컴퓨터 Wi-Fi 자체가 `hihi`에 연결됐는지 확인
- `ping 192.168.4.1`로 ESP32 주소가 응답하는지 확인
- 서버를 다시 시작해 `[ESP32 AP] WebSocket connected` 로그 확인
- 커스텀 주소를 쓰는 경우 `ESP32_WS_URL=ws://주소:포트 npm start`로 서버 실행

### 버튼이 항상 눌린 것으로 표시되는 경우

- 택트 스위치의 같은 쪽 다리 두 개에 GPIO와 GND를 연결하지 않았는지 확인
- GPIO 케이블이 GND와 직접 닿지 않았는지 확인
- 코드에 설정된 GPIO 번호와 실제 배선이 일치하는지 확인

### 버튼을 눌러도 반응이 없는 경우

- 버튼 반대쪽이 ESP32의 GND에 연결됐는지 확인
- 시리얼 모니터에 `PRESSED`와 `RELEASED` 로그가 나타나는지 확인
- 잘못된 보드 환경으로 펌웨어를 올리지 않았는지 확인

### ESP32 연결이 자주 끊기는 경우

- 전원 공급이 안정적인 USB 케이블 사용
- Wi-Fi 신호가 약하지 않은지 확인
- 너무 긴 버튼 케이블은 줄이기
- 긴 배선을 꼭 사용해야 하면 외부 풀업 저항이나 노이즈 제거용 커패시터 적용 검토

## 12. 사용 전 최종 점검표

- [ ] ESP32 보드 종류 확인
- [ ] 보드 종류에 맞는 GPIO 사용
- [ ] 버튼 4개의 반대쪽을 공통 GND에 연결
- [ ] 데이터 통신 가능한 USB 케이블 사용
- [ ] ESP32 AP 이름과 8자 이상의 비밀번호 확인
- [ ] 컴퓨터를 ESP32의 `hihi` Wi-Fi에 연결
- [ ] Node.js 서버 실행
- [ ] 올바른 PlatformIO 환경으로 펌웨어 업로드
- [ ] 시리얼 모니터에서 ESP32 AP 시작 확인
- [ ] 시리얼 모니터에서 WebSocket 연결 확인
- [ ] 각 버튼의 누름과 해제 로그 확인
- [ ] 브라우저에서 ESP32 연결 상태 확인
- [ ] 단일 버튼과 동시 버튼 입력 확인

## 13. 현재 프로젝트 상태

현재 프로젝트는 다음 항목이 확인된 상태입니다.

- 일반 ESP32용 펌웨어 빌드 성공
- ESP32-S3용 펌웨어 빌드 성공
- 서버·브라우저·ESP32 WebSocket 중계 테스트 통과
- 네 방향 동시 입력 테스트 통과
- ESP32 연결 및 해제 감지 테스트 통과

따라서 실제 사용을 위해 남은 작업은 보드 연결, 버튼 배선, 펌웨어 업로드, 컴퓨터의 `hihi` 연결 및 실제 버튼 테스트입니다.
