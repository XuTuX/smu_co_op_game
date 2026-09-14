/**
 * 모든 미니게임이 함께 쓰는 게임 종료 연출.
 * - 종료 효과음("루~우~")은 각 게임의 사운드 엔진이 재생한다.
 * - 잠시 뒤 점수판이 위에서 내려오고, 그 뒤 배경은 살짝 어둡게 깔린다.
 * - 준비된 13가지 마무리 멘트 중 하나를 무작위로 보여준다.
 */
const GAME_OVER_MESSAGES = [
  '팀워크가 정말 좋았어요!',
  '서로 잘 맞춰줬어요! 멋진 플레이!',
  '끝까지 집중력 최고였어요!',
  '이번 플레이, 정말 멋졌어요!',
  '우리 팀 합이 점점 좋아지고 있어요!',
  '좋은 팀워크였어요! 다음 판도 기대돼요!',
  '이번 판도 완벽한 호흡이었어요!',
  '서로의 플레이가 제대로 빛났어요!',
  '끝까지 멋지게 해냈어요!',
  '우리 팀, 합이 꽤 좋은데요?',
  '점점 더 멋진 플레이가 나오고 있어요!',
  '이 팀워크면 다음 판도 기대해볼 만해요!',
  '끝까지 멋진 팀플레이였어요!'
];

class GameOverPresenter {
  constructor({ modal, messageElement, delay = 2000 } = {}) {
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
