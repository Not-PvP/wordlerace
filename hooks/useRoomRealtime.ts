import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { RoomRow, PlayerRow } from "@/types/game";

interface RoomRealtimeState {
  room: RoomRow | null;
  players: PlayerRow[];
  loading: boolean;
  error: string | null;
}

/**
 * Loads a room + its players and keeps them live via Supabase Realtime.
 * This is read-only: it reflects server-authoritative state, it never
 * writes anything back.
 */
export function useRoomRealtime(roomId: string | null): RoomRealtimeState {
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let active = true;
    // Resetting to a loading state for the newly-subscribed room id, before
    // the fetch below resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    async function load() {
      const [roomResult, playersResult] = await Promise.all([
        supabase.from("rooms").select("*").eq("id", roomId as string).maybeSingle(),
        supabase
          .from("players")
          .select("*")
          .eq("room_id", roomId as string)
          .order("created_at", { ascending: true }),
      ]);

      if (!active) return;

      if (roomResult.error || !roomResult.data) {
        setError("Room not found");
        setLoading(false);
        return;
      }

      setRoom(roomResult.data as RoomRow);
      setPlayers((playersResult.data as PlayerRow[]) ?? []);
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          setRoom(payload.new as RoomRow);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setPlayers((prev) => {
            if (payload.eventType === "DELETE") {
              const removedId = (payload.old as Partial<PlayerRow>).id;
              return prev.filter((p) => p.id !== removedId);
            }
            const updated = payload.new as PlayerRow;
            const exists = prev.some((p) => p.id === updated.id);
            const next = exists
              ? prev.map((p) => (p.id === updated.id ? updated : p))
              : [...prev, updated];
            return [...next].sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return { room, players, loading, error };
}
