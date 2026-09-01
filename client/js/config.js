/**
 * Game Configuration and Constants
 */
const CONFIG = {
  CANVAS_WIDTH: 1200,
  CANVAS_HEIGHT: 800,

  GAME_DURATION: 60,

  PARKING_RUN: {
    STARTING_LIVES: 3,
    ATTEMPT_TIME_SEC: 40,
    COLLISION_COOLDOWN_SEC: 1.25,
    ROUND_TRANSITION_MS: 900
  },

  SCORING: {
    PARKING_SUCCESS: 100
  },

  BUS: {
    WIDTH: 42,
    LENGTH: 116,
    WHEELBASE: 74,
    FRONT_OVERHANG: 20,
    REAR_OVERHANG: 22,

    MAX_SPEED: 3.1,
    MAX_REVERSE_SPEED: -1.8,
    ACCELERATION: 0.05,
    REVERSE_ACCEL: 0.04,
    DECELERATION: 0.14, // Brake
    NATURAL_FRICTION: 0.035, // Coasting drag

    MAX_STEER_ANGLE: 0.68, // ~39 degrees
    STEER_SPEED: 1.0       // Radians per second; full lock takes about 0.68 sec
  },

  PARKING: {
    WIDTH: 52,
    LENGTH: 130,
    ANGLE_TOLERANCE_DEG: 15,       // Max rotation error in degrees (±15°)
    MAX_STOP_SPEED: 0.25,          // Velocity threshold to be considered stopped
    DWELL_TIME_SEC: 1.0,           // Time to hold position in seconds
    CORNER_INSIDE_TOLERANCE: 12    // Padding margin for 4-corner containment
  },

  // Parking judgment stays consistent. Endless-round difficulty comes from
  // the number and arrangement of physical obstacles, not tighter rules.
  PARKING_DIFFICULTY: {
    label: '무한 주차',
    spotWidth: 72,
    spotLength: 158,
    angleToleranceDeg: 22,
    maxStopSpeed: 0.38,
    dwellTimeSec: 0.7,
    cornerTolerance: 16
  },

  PLAYERS: {
    forward: { name: 'Player 1 (전진)', key: 'W / ↑', color: '#10B981', label: 'FORWARD' },
    backward: { name: 'Player 2 (후진)', key: 'S / ↓', color: '#F59E0B', label: 'BACKWARD' },
    left: { name: 'Player 3 (좌회전)', key: 'A / ←', color: '#3B82F6', label: 'LEFT' },
    right: { name: 'Player 4 (우회전)', key: 'D / →', color: '#EC4899', label: 'RIGHT' }
  }
};

window.CONFIG = CONFIG;
