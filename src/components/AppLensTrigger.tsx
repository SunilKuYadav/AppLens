import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
} from 'react-native';
import { useAppLens } from '../core/AppLensProvider';

const BUTTON_SIZE = 48;
const EDGE_MARGIN = 16;
// Pointer travel (px) beyond which a gesture counts as a drag, not a tap.
const DRAG_THRESHOLD = 6;

/**
 * Floating, draggable trigger button.
 *
 * Rendered as an absolutely-positioned overlay that the user can pick up and
 * move anywhere on screen, so it never permanently blocks the UI being
 * inspected. A quick press (no meaningful movement) opens the debug modal; a
 * drag relocates the button. The button is clamped to stay fully on screen.
 *
 * Implemented with React Native's built-in Animated + PanResponder — no extra
 * gesture dependency.
 */
export function AppLensTrigger(): React.JSX.Element {
  const { setModalVisible } = useAppLens();

  const { width, height } = Dimensions.get('window');

  // Starting position: bottom-right, matching the previous fixed placement.
  const initial = useMemo(
    () => ({
      x: width - BUTTON_SIZE - EDGE_MARGIN,
      y: height - BUTTON_SIZE - EDGE_MARGIN * 2,
    }),
    [width, height],
  );

  // Committed position (where the button currently rests).
  const pan = useRef(new Animated.ValueXY(initial)).current;
  // Tracks whether the current gesture has moved far enough to be a drag.
  const dragged = useRef(false);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim the touch on start (so a tap works) and also capture any move,
        // so a parent ScrollView / navigator can't steal the drag gesture.
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > DRAG_THRESHOLD ||
          Math.abs(gesture.dy) > DRAG_THRESHOLD,
        onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
          Math.abs(gesture.dx) > DRAG_THRESHOLD ||
          Math.abs(gesture.dy) > DRAG_THRESHOLD,
        // Once we own the gesture, don't hand it back to an ancestor.
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: () => {
          dragged.current = false;
          // Freeze the current value as an offset and zero the base, so moves
          // are applied relative to where the button currently rests. This is
          // the documented Animated.ValueXY drag pattern and is more reliable
          // than reading the private _value.
          pan.extractOffset();
        },

        onPanResponderMove: (_evt, gesture) => {
          if (
            Math.abs(gesture.dx) > DRAG_THRESHOLD ||
            Math.abs(gesture.dy) > DRAG_THRESHOLD
          ) {
            dragged.current = true;
          }
          // With the offset extracted on grant, the live value is just the
          // delta of this gesture.
          pan.setValue({ x: gesture.dx, y: gesture.dy });
        },

        onPanResponderRelease: (_evt, gesture) => {
          // Fold the gesture delta back into the base value so getTranslate
          // reflects the final resting position.
          pan.flattenOffset();

          if (!dragged.current) {
            // Treated as a tap — open the console.
            setModalVisible(true);
            return;
          }

          // Clamp the drop position so the button stays fully on screen.
          const { width: w, height: h } = Dimensions.get('window');
          // @ts-expect-error _value is the current animated value (RN runtime).
          const curX: number = pan.x._value;
          // @ts-expect-error _value is the current animated value (RN runtime).
          const curY: number = pan.y._value;
          const nextX = clamp(
            curX,
            EDGE_MARGIN,
            w - BUTTON_SIZE - EDGE_MARGIN,
          );
          const nextY = clamp(
            curY,
            EDGE_MARGIN,
            h - BUTTON_SIZE - EDGE_MARGIN,
          );
          Animated.spring(pan, {
            toValue: { x: nextX, y: nextY },
            useNativeDriver: false,
            friction: 7,
            tension: 60,
          }).start();
        },
      }),
    // pan / setModalVisible are stable refs; create the responder once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[styles.trigger, { transform: pan.getTranslateTransform() }]}
      accessibilityRole="button"
      accessibilityLabel="Open AppLens debug console (draggable)"
    >
      <Text style={styles.icon}>🔍</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    position: 'absolute',
    // Anchor at top-left; position is driven entirely by the pan transform.
    top: 0,
    left: 0,
    zIndex: 9999,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: '#0d0d0dCC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00ff88',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  icon: {
    fontSize: 20,
  },
});
