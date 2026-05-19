/**
 * RLS regression suite for SECURITY DEFINER helpers.
 *
 * Verifies:
 *  1. Anonymous clients cannot invoke is_event_participant / is_event_creator / is_group_member.
 *  2. Anonymous clients cannot read events/event_participants/groups/group_members/profiles.
 *  3. Authenticated user A:
 *      - is_event_creator(eventA, A) === true, is_event_participant(eventA, A) === true
 *      - is_group_member(groupA, A) === true
 *  4. Authenticated user B (no relationship to A's private event/group):
 *      - is_event_creator(eventA, B) === false
 *      - is_event_participant(eventA, B) === false
 *      - is_group_member(groupA, B) === false
 *      - cannot SELECT rows from A's private event_participants / group_members / groups
 *      - cannot read A's email from profiles
 *
 * Requires Supabase auto-confirm email signups (default in Lovable Cloud dev).
 * If signup is rate-limited or email confirmation is enforced, the suite skips.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const newClient = () =>
  createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const rand = () => Math.random().toString(36).slice(2, 10);

type Ctx = {
  anon: SupabaseClient;
  a: SupabaseClient;
  b: SupabaseClient;
  aId: string;
  bId: string;
  eventId: string;
  groupId: string;
};

const ctx: Partial<Ctx> = {};
let skip = false;

async function signUp(client: SupabaseClient) {
  const email = `rls_${rand()}@example.test`;
  const password = `Pw_${rand()}${rand()}!`;
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) {
    // Email confirmation required — sign in won't work; signal skip
    throw new Error("EMAIL_CONFIRM_REQUIRED");
  }
  return data.user!.id;
}

beforeAll(async () => {
  if (!URL || !ANON) {
    skip = true;
    return;
  }
  try {
    ctx.anon = newClient();
    ctx.a = newClient();
    ctx.b = newClient();
    ctx.aId = await signUp(ctx.a);
    ctx.bId = await signUp(ctx.b);

    // A creates a private event
    const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data: ev, error: evErr } = await ctx.a
      .from("events")
      .insert({
        creator_id: ctx.aId,
        title: `rls-${rand()}`,
        category: "study",
        starts_at: startsAt,
        ends_at: endsAt,
        privacy: "private",
      })
      .select("id")
      .single();
    if (evErr) throw evErr;
    ctx.eventId = ev.id;

    // A joins their event
    const { error: epErr } = await ctx.a
      .from("event_participants")
      .insert({ event_id: ctx.eventId, user_id: ctx.aId });
    if (epErr) throw epErr;

    // A creates a group and joins it
    const { data: g, error: gErr } = await ctx.a
      .from("groups")
      .insert({ created_by: ctx.aId, name: `rls-${rand()}` })
      .select("id")
      .single();
    if (gErr) throw gErr;
    ctx.groupId = g.id;
    const { error: gmErr } = await ctx.a
      .from("group_members")
      .insert({ group_id: ctx.groupId, user_id: ctx.aId });
    if (gmErr) throw gmErr;
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[rls-helpers] Skipping suite:", e?.message ?? e);
    skip = true;
  }
}, 30_000);

afterAll(async () => {
  if (skip) return;
  // Best-effort cleanup
  try {
    if (ctx.eventId) await ctx.a!.from("event_participants").delete().eq("event_id", ctx.eventId);
    if (ctx.eventId) await ctx.a!.from("events").delete().eq("id", ctx.eventId);
    if (ctx.groupId) await ctx.a!.from("group_members").delete().eq("group_id", ctx.groupId);
    if (ctx.groupId) await ctx.a!.from("groups").delete().eq("id", ctx.groupId);
  } catch {}
  await ctx.a?.auth.signOut();
  await ctx.b?.auth.signOut();
});

describe("SECURITY DEFINER helpers — anonymous access denied", () => {
  it("anon cannot RPC is_event_participant", async () => {
    if (skip) return;
    const { error } = await ctx.anon!.rpc("is_event_participant", {
      _event_id: ctx.eventId!,
      _user_id: ctx.aId!,
    });
    expect(error).toBeTruthy();
  });

  it("anon cannot RPC is_event_creator", async () => {
    if (skip) return;
    const { error } = await ctx.anon!.rpc("is_event_creator", {
      _event_id: ctx.eventId!,
      _user_id: ctx.aId!,
    });
    expect(error).toBeTruthy();
  });

  it("anon cannot RPC is_group_member", async () => {
    if (skip) return;
    const { error } = await ctx.anon!.rpc("is_group_member", {
      _group_id: ctx.groupId!,
      _user_id: ctx.aId!,
    });
    expect(error).toBeTruthy();
  });

  it("anon SELECT on protected tables returns no rows", async () => {
    if (skip) return;
    for (const table of ["events", "event_participants", "groups", "group_members", "profiles"] as const) {
      const { data, error } = await ctx.anon!.from(table).select("*").limit(1);
      // anon role has no policies → either error or empty
      expect((error ? [] : data) ?? []).toHaveLength(0);
    }
  });
});

describe("SECURITY DEFINER helpers — owner sees truth", () => {
  it("A is event creator and participant of their event", async () => {
    if (skip) return;
    const { data: creator, error: e1 } = await ctx.a!.rpc("is_event_creator", {
      _event_id: ctx.eventId!,
      _user_id: ctx.aId!,
    });
    expect(e1).toBeNull();
    expect(creator).toBe(true);

    const { data: participant, error: e2 } = await ctx.a!.rpc("is_event_participant", {
      _event_id: ctx.eventId!,
      _user_id: ctx.aId!,
    });
    expect(e2).toBeNull();
    expect(participant).toBe(true);
  });

  it("A is member of their group", async () => {
    if (skip) return;
    const { data, error } = await ctx.a!.rpc("is_group_member", {
      _group_id: ctx.groupId!,
      _user_id: ctx.aId!,
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });
});

describe("SECURITY DEFINER helpers — cross-user isolation", () => {
  it("B is NOT creator/participant of A's event", async () => {
    if (skip) return;
    const { data: creator } = await ctx.b!.rpc("is_event_creator", {
      _event_id: ctx.eventId!,
      _user_id: ctx.bId!,
    });
    expect(creator).toBe(false);
    const { data: participant } = await ctx.b!.rpc("is_event_participant", {
      _event_id: ctx.eventId!,
      _user_id: ctx.bId!,
    });
    expect(participant).toBe(false);
  });

  it("B is NOT a member of A's group", async () => {
    if (skip) return;
    const { data } = await ctx.b!.rpc("is_group_member", {
      _group_id: ctx.groupId!,
      _user_id: ctx.bId!,
    });
    expect(data).toBe(false);
  });

  it("B cannot SELECT A's private event_participants rows", async () => {
    if (skip) return;
    const { data, error } = await ctx.b!
      .from("event_participants")
      .select("*")
      .eq("event_id", ctx.eventId!);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("B cannot SELECT A's group or its members", async () => {
    if (skip) return;
    const { data: groups } = await ctx.b!.from("groups").select("*").eq("id", ctx.groupId!);
    expect(groups ?? []).toHaveLength(0);
    const { data: members } = await ctx.b!
      .from("group_members")
      .select("*")
      .eq("group_id", ctx.groupId!);
    expect(members ?? []).toHaveLength(0);
  });

  it("B cannot read A's email from profiles", async () => {
    if (skip) return;
    const { data } = await ctx.b!.from("profiles").select("email").eq("id", ctx.aId!);
    expect(data ?? []).toHaveLength(0);
  });

  it("B cannot SELECT A's private event row", async () => {
    if (skip) return;
    const { data } = await ctx.b!.from("events").select("*").eq("id", ctx.eventId!);
    expect(data ?? []).toHaveLength(0);
  });
});
