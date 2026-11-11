export type PointerCaptureTarget = {
  isConnected?: boolean;
  setPointerCapture?: (pointerId: number) => void;
};

/**
 * Capture a pointer without letting a browser-specific InvalidStateError tear
 * down the whole game. Android Chrome can reject capture when the pointer was
 * already cancelled; movement still works through normal bubbling without it.
 */
export function safeSetPointerCapture(
  target: PointerCaptureTarget | null | undefined,
  pointerId: number
): boolean {
  if (!target || !Number.isFinite(pointerId) || pointerId < 0) return false;
  if (target.isConnected === false) return false;
  if (typeof target.setPointerCapture !== "function") return false;
  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

export type FullscreenTarget = {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export type FullscreenDocument = {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  documentElement: FullscreenTarget;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void>;
};

export type FullscreenResult = {
  active: boolean;
  error: boolean;
};

/**
 * Toggle real browser fullscreen and await the promise returned by the API.
 * A synchronous try/catch alone does not catch request rejections, which is
 * what makes a blocked fullscreen request look like an unhandled crash.
 */
export async function toggleFullscreen(
  doc: FullscreenDocument = document as unknown as FullscreenDocument,
  target?: FullscreenTarget | null
): Promise<FullscreenResult> {
  try {
    const current = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (current) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (!exit) return { active: false, error: true };
      await exit.call(doc);
      return { active: false, error: false };
    }

    if (doc.fullscreenEnabled === false || doc.webkitFullscreenEnabled === false) {
      return { active: false, error: true };
    }

    const element = target || doc.documentElement;
    if (typeof element.requestFullscreen === "function") {
      await element.requestFullscreen();
      return { active: true, error: false };
    }
    if (typeof element.webkitRequestFullscreen === "function") {
      await element.webkitRequestFullscreen();
      return { active: true, error: false };
    }
    return { active: false, error: true };
  } catch {
    return { active: false, error: true };
  }
}
