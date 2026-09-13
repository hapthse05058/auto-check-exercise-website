import { useCallback, useEffect, useState } from "react";

import { IS_PUSH_CONFIGURED } from "../config.js";
import {
  disablePush,
  enablePush,
  getPermission,
  hasRegisteredDevice,
  isIOS,
  isPushSupported,
  isStandalone,
} from "../lib/push.js";

/**
 * Browser push opt-in state for the admin.
 *
 * Deliberately shaped like usePwaInstall: both wrap a browser capability that
 * can only be triggered from a user gesture and that iOS gates behind "add to
 * Home Screen", and both are surfaced from the same profile menu.
 *
 * `supported` is false when the browser cannot do push OR when the Firebase
 * console values have not been configured yet — in either case the affordance
 * is hidden rather than failing at click time. The bell itself works regardless.
 */
export function usePushNotifications() {
  const [permission, setPermission] = useState(() => getPermission());
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState(null);

  useEffect(() => {
    setEnabled(getPermission() === "granted" && hasRegisteredDevice());
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setLastError(null);
    try {
      const result = await enablePush();
      setPermission(getPermission());
      setEnabled(result.ok);
      if (!result.ok) setLastError(result.reason);
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await disablePush();
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    supported: isPushSupported() && IS_PUSH_CONFIGURED,
    // Whether to offer the opt-in. NOT `permission === "default"`: a browser can
    // already hold the permission while THIS profile has no device token —
    // localStorage cleared, a second browser profile, or the permission granted
    // for some other reason. Keying the button on "default" left those users
    // with no enable button AND no disable button, i.e. no way to turn push on.
    canEnable:
      isPushSupported() &&
      IS_PUSH_CONFIGURED &&
      !enabled &&
      permission !== "denied",
    browserSupported: isPushSupported(),
    configured: IS_PUSH_CONFIGURED,
    permission,
    enabled,
    busy,
    lastError,
    enable,
    disable,
    isIOS: isIOS(),
    isStandalone: isStandalone(),
  };
}
