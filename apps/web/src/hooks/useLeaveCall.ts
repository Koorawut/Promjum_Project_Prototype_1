"use client";

import { useCallback } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useGameStore } from "@/store/game";

// Ends the still-connected post-match voice call as a side effect of ANY
// navigation away from it — home, practice, the lobby, logout, "เสร็จสิ้น",
// or a rematch. Only ends *this* client's side (emits "finish_match", which
// the server now forwards only to the opponent as "call_end" + tears the
// runtime down) and resets local call state; it deliberately does NOT
// navigate anywhere itself, so the caller's own navigation (a <Link href>,
// router.push, whatever) is free to proceed to wherever the user actually
// clicked instead of being forced to /home.
export function useLeaveCall() {
  const socket = useSocket();
  return useCallback(() => {
    const { voiceEnabled, reset } = useGameStore.getState();
    if (!voiceEnabled) return;
    socket?.emit("finish_match");
    reset();
  }, [socket]);
}
