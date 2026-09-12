/**
 * 모든 미니게임이 함께 쓰는 게임 종료 연출.
 * - 종료 효과음("루~우~")은 각 게임의 사운드 엔진이 재생한다.
 * - 잠시 뒤 점수판이 위에서 내려오고, 그 뒤 배경은 살짝 어둡게 깔린다.
 * - 노래방 끝인사처럼 준비된 멘트 중 하나를 무작위로 보여준다.
 */
const GAME_OVER_MESSAGES = [
  '수고하셨습니다! 오늘도 멋진 무대였어요!',
  '박수! 참가자 전원 명예의 전당 등극!',
  '다음 곡 예약됐습니다. 앙코르 가시죠!',
  '점수는 잊고, 우린 이미 최고의 팀!',
  '여기서 끝내기 아쉽죠? 한 판 더!',
  '노래방 문은 아직 열려 있어요!',
  '오늘의 기록, 소중히 저장해뒀어요!',
  '다음 판은 더 잘할 거예요. 화이팅!',
  '마이크 놓기 전에 한 번만 더!',
  '잘 싸웠습니다! 다음 무대에서 또 만나요!'
];

class GameOverPresenter {
  constructor({ modal, messageElement, delay = 2600 } = {}) {
    this.modal = modal || null;
    this.messageElement = messageElement || null;
    this.delay = delay;
    this.timer = null;
  }

  static randomMessage() {
    return GAME_OVER_MESSAGES[Math.floor(Math.random() * GAME_OVER_MESSAGES.length)];
  }

  begin(customMessage) {
    this.cancel();
    if (this.messageElement) {
      this.messageElement.textContent = customMessage || GameOverPresenter.randomMessage();
    }
    if (!this.modal) return;
    this.modal.classList.add('hidden');
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.modal.classList.remove('hidden');
      void this.modal.offsetWidth;
      this.modal.classList.add('is-revealing');
    }, this.delay);
  }

  cancel() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.modal) this.modal.classList.remove('is-revealing');
  }

  hide() {
    this.cancel();
    if (this.modal) this.modal.classList.add('hidden');
  }
}

window.GameOverPresenter = GameOverPresenter;
