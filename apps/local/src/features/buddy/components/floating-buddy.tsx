"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue } from "motion/react";
import { cn } from "@/lib/utils";
import { buddyMargin } from "../constants";
import type {
  BuddyPreferencesSchema,
  UiPreferencesPatchSchema,
} from "../../settings/schemas";
import type { BuddyMood, BuddyState, BuddyViewport } from "../types";
import {
  clampBuddyPosition,
  getBuddyBounds,
  normalizeBuddyPosition,
  resolveBuddyPosition,
} from "../lib/buddy-position";
import { formatBuddyCharacter, getBuddyPresentation } from "../lib/formatters";
import { BuddySprite } from "./buddy-sprite";

type FloatingBuddyProps = {
  state: BuddyState;
  preferences: BuddyPreferencesSchema;
  save: (patch: UiPreferencesPatchSchema) => void;
};

export const FloatingBuddy = ({
  state,
  preferences,
  save,
}: FloatingBuddyProps) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [viewport, setViewport] = useState<BuddyViewport | null>(null);
  const [dragging, setDragging] = useState(false);
  const [landing, setLanding] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [waving, setWaving] = useState(false);
  const [wave, setWave] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const isDragging = useRef(false);
  const movement = useRef(false);
  useEffect(() => {
    const update = () => {
      const visual = window.visualViewport;
      setViewport({
        left: visual?.offsetLeft ?? 0,
        top: visual?.offsetTop ?? 0,
        width: visual?.width ?? window.innerWidth,
        height: visual?.height ?? window.innerHeight,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
  useEffect(() => {
    if (!viewport || isDragging.current) return;
    const position = resolveBuddyPosition(
      preferences.position,
      viewport,
      preferences.size,
    );
    x.set(position.x);
    y.set(position.y);
  }, [preferences.position, preferences.size, viewport, x, y]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(media?.matches ?? false);
      setHidden(document.hidden);
    };
    update();
    media?.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      media?.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setSleeping(false);
      clearTimeout(timer);
      timer = setTimeout(() => setSleeping(true), 90000);
    };
    wake();
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
    window.addEventListener("scroll", wake, { passive: true, capture: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("scroll", wake, true);
    };
  }, []);
  useEffect(() => {
    if (!wave) return;
    const timer = setTimeout(() => setWaving(false), 1600);
    return () => clearTimeout(timer);
  }, [wave]);
  useEffect(() => {
    if (!landing) return;
    const timer = setTimeout(() => setLanding(false), 450);
    return () => clearTimeout(timer);
  }, [landing]);
  const { name } = formatBuddyCharacter(preferences.character);
  const presentation = getBuddyPresentation(state, preferences.character);
  const mood: BuddyMood = dragging
    ? "pickup"
    : landing
      ? "landing"
      : presentation.mood !== "idle"
        ? presentation.mood
        : waving
          ? "wave"
          : sleeping
            ? "sleep"
            : "idle";
  const still = reduced || !preferences.animations || hidden;
  const persist = () => {
    if (!viewport) return;
    const position = clampBuddyPosition(
      { x: x.get(), y: y.get() },
      viewport,
      preferences.size,
    );
    x.set(position.x);
    y.set(position.y);
    const normalized = normalizeBuddyPosition(
      position,
      viewport,
      preferences.size,
    );
    save({ buddy: { position: normalized } });
  };
  if (!viewport) return null;
  return createPortal(
    <div
      data-testid="buddy-layer"
      className="pip-layer"
      style={
        {
          pointerEvents: "none",
          "--buddy-size": `${preferences.size}px`,
        } as CSSProperties
      }
    >
      <motion.button
        type="button"
        aria-label={`Move ${name}. Drag to place, use arrow keys to move, or press Home to reset.`}
        aria-describedby="pip-instructions"
        data-mood={mood}
        className={cn("pip-handle", dragging && "pip-dragging")}
        style={{ x, y, pointerEvents: "auto", touchAction: "none" }}
        drag
        dragConstraints={getBuddyBounds(viewport, preferences.size)}
        dragElastic={0}
        dragMomentum={false}
        onDragStart={() => {
          isDragging.current = true;
          movement.current = true;
          setDragging(true);
        }}
        onDragEnd={() => {
          isDragging.current = false;
          persist();
          setDragging(false);
          setLanding(true);
        }}
        onPointerDown={() => {
          movement.current = false;
        }}
        onPointerCancel={() => {
          isDragging.current = false;
          persist();
          setDragging(false);
          setLanding(true);
        }}
        onKeyDown={(event) => {
          if (
            event.altKey ||
            event.metaKey ||
            event.ctrlKey ||
            event.nativeEvent.isComposing
          )
            return;
          const step = event.shiftKey ? 32 : 12;
          switch (event.key) {
            case "ArrowLeft":
              x.set(x.get() - step);
              break;
            case "ArrowRight":
              x.set(x.get() + step);
              break;
            case "ArrowUp":
              y.set(y.get() - step);
              break;
            case "ArrowDown":
              y.set(y.get() + step);
              break;
            case "Home":
              save({ buddy: { position: null } });
              break;
            default:
              return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (event.key !== "Home") persist();
        }}
        onClick={() => {
          if (!movement.current) {
            setWaving(true);
            setWave((current) => current + 1);
          }
        }}
      >
        <span className="pip-motion" data-mood={mood} data-still={still}>
          <BuddySprite
            character={preferences.character}
            mood={mood}
            still={still}
            size={preferences.size}
          />
          {!still && (mood === "celebrate" || mood === "dance") && (
            <span className="pip-confetti" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => (
                <i
                  key={index}
                  style={{ "--particle": index } as CSSProperties}
                />
              ))}
            </span>
          )}
        </span>
        {state.reaction && !dragging && (
          <span
            aria-hidden="true"
            className="pip-message"
            style={{
              pointerEvents: "none",
              maxWidth: Math.min(288, viewport.width - buddyMargin * 2),
              left:
                x.get() < viewport.left + viewport.width / 2 ? 0 : undefined,
              right:
                x.get() >= viewport.left + viewport.width / 2 ? 0 : undefined,
              top:
                y.get() < viewport.top + preferences.size + buddyMargin * 2
                  ? preferences.size + buddyMargin
                  : undefined,
              bottom:
                y.get() >= viewport.top + preferences.size + buddyMargin * 2
                  ? preferences.size + buddyMargin
                  : undefined,
            }}
          >
            {state.reaction.message}
          </span>
        )}
      </motion.button>
      <p id="pip-instructions" className="sr-only">
        Move {name} anywhere in the window. Hide your buddy or pause animations
        in Appearance settings.
      </p>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {presentation.message}
      </p>
    </div>,
    document.body,
  );
};
