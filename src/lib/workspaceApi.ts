import { initialFeedback, initialWorkspaces } from "../data/demo";
import type { ClientWorkspace, FeedbackEntry, MessageItem } from "../types";
import { supabase } from "./supabase";

type WorkspaceRow = {
  id: string;
  invite_token: string;
  name: string;
  email: string;
  avatar: string;
  welcome: string;
  status: "active" | "review" | "completed";
  location: string | null;
  project: unknown;
  modules: unknown;
  offer: unknown;
  custom_note: string;
  model: unknown;
  renders: unknown;
  documents: unknown;
  portfolio: unknown;
  updated_at?: string;
};

type MessageRow = {
  id: string;
  workspace_id: string;
  from_role: "client" | "studio";
  text: string;
  attachment: string | null;
  created_at: string;
};

type FeedbackRow = {
  id: string;
  workspace_id: string;
  author: string;
  role: string;
  ratings: unknown;
  notes: string;
  recommend: boolean;
  created_at: string;
};

const fallbackWorkspace = initialWorkspaces[0];

function asObject<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }
  return fallback;
}

function asArray<T>(value: unknown, fallback: T[]): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return fallback;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapMessageRow(row: MessageRow): MessageItem {
  return {
    id: String(row.id),
    from: row.from_role,
    text: row.text,
    time: formatTime(row.created_at),
    attachment: row.attachment ?? undefined,
  };
}

function mapFeedbackRow(row: FeedbackRow): FeedbackEntry {
  const ratings = asObject(row.ratings, { design: 5, navigation: 4, model: 5, renders: 4 });
  return {
    id: String(row.id),
    workspaceId: row.workspace_id,
    author: row.author,
    role: row.role,
    ratings,
    notes: row.notes,
    recommend: row.recommend,
    submittedAt: formatDateTime(row.created_at),
  };
}

function mapWorkspaceRow(row: WorkspaceRow, messages: MessageItem[] = []): ClientWorkspace {
  return {
    id: row.id,
    inviteToken: row.invite_token,
    name: row.name,
    email: row.email,
    avatar: row.avatar || fallbackWorkspace.avatar,
    welcome: row.welcome || fallbackWorkspace.welcome,
    status: row.status || fallbackWorkspace.status,
    location: row.location ?? undefined,
    project: asObject(row.project, fallbackWorkspace.project),
    modules: asObject(row.modules, fallbackWorkspace.modules),
    offer: asObject(row.offer, fallbackWorkspace.offer),
    customNote: row.custom_note || "",
    model: asObject(row.model, fallbackWorkspace.model),
    renders: asArray(row.renders, []),
    documents: asArray(row.documents, []),
    messages,
    portfolio: asArray(row.portfolio, []),
  };
}

function mapWorkspaceBundle(bundle: Record<string, unknown>): ClientWorkspace {
  return {
    id: String(bundle.id),
    inviteToken: String(bundle.inviteToken ?? bundle.invite_token ?? ""),
    name: String(bundle.name ?? fallbackWorkspace.name),
    email: String(bundle.email ?? fallbackWorkspace.email),
    avatar: String(bundle.avatar ?? fallbackWorkspace.avatar),
    welcome: String(bundle.welcome ?? fallbackWorkspace.welcome),
    status: (bundle.status as ClientWorkspace["status"]) ?? fallbackWorkspace.status,
    location: typeof bundle.location === "string" ? bundle.location : undefined,
    project: asObject(bundle.project, fallbackWorkspace.project),
    modules: asObject(bundle.modules, fallbackWorkspace.modules),
    offer: asObject(bundle.offer, fallbackWorkspace.offer),
    customNote: String(bundle.customNote ?? bundle.custom_note ?? ""),
    model: asObject(bundle.model, fallbackWorkspace.model),
    renders: asArray(bundle.renders, []),
    documents: asArray(bundle.documents, []),
    messages: asArray(bundle.messages, []).map((message) => {
      const entry = message as Record<string, unknown>;
      return {
        id: String(entry.id ?? crypto.randomUUID()),
        from: (entry.from as MessageItem["from"]) ?? "studio",
        text: String(entry.text ?? ""),
        time: String(entry.time ?? "00:00"),
        attachment: typeof entry.attachment === "string" ? entry.attachment : undefined,
      };
    }),
    portfolio: asArray(bundle.portfolio, []),
  };
}

function workspaceToRow(workspace: ClientWorkspace): WorkspaceRow {
  const { messages: _messages, ...rest } = workspace;
  void _messages;
  return {
    id: rest.id,
    invite_token: rest.inviteToken,
    name: rest.name,
    email: rest.email,
    avatar: rest.avatar,
    welcome: rest.welcome,
    status: rest.status,
    location: rest.location ?? null,
    project: rest.project,
    modules: rest.modules,
    offer: rest.offer,
    custom_note: rest.customNote,
    model: rest.model,
    renders: rest.renders,
    documents: rest.documents,
    portfolio: rest.portfolio,
  };
}

export async function loadWorkspaceByInvite(inviteToken: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_workspace_bundle_by_invite", { invite_token_input: inviteToken });
  if (error) throw error;
  return data ? mapWorkspaceBundle(data as Record<string, unknown>) : null;
}

export async function loadWorkspaceForCurrentUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_workspace_bundle_for_current_user");
  if (error) throw error;
  return data ? mapWorkspaceBundle(data as Record<string, unknown>) : null;
}

export async function loadStudioSnapshot() {
  if (!supabase) return { workspaces: [] as ClientWorkspace[], feedbackEntries: [] as FeedbackEntry[] };

  const { data: workspaceRows, error: workspaceError } = await supabase.from("client_workspaces").select("*").order("updated_at", { ascending: false });
  if (workspaceError) throw workspaceError;

  const ids = (workspaceRows ?? []).map((row) => row.id);
  if (!ids.length) {
    return { workspaces: [] as ClientWorkspace[], feedbackEntries: [] as FeedbackEntry[] };
  }

  const [{ data: messageRows, error: messageError }, { data: feedbackRows, error: feedbackError }] = await Promise.all([
    supabase.from("workspace_messages").select("*").in("workspace_id", ids).order("created_at", { ascending: true }),
    supabase.from("workspace_feedback").select("*").in("workspace_id", ids).order("created_at", { ascending: false }),
  ]);

  if (messageError) throw messageError;
  if (feedbackError) throw feedbackError;

  const messagesByWorkspace = new Map<string, MessageItem[]>();
  (messageRows as MessageRow[] | null)?.forEach((row) => {
    const current = messagesByWorkspace.get(row.workspace_id) ?? [];
    current.push(mapMessageRow(row));
    messagesByWorkspace.set(row.workspace_id, current);
  });

  return {
    workspaces: (workspaceRows as WorkspaceRow[]).map((row) => mapWorkspaceRow(row, messagesByWorkspace.get(row.id) ?? [])),
    feedbackEntries: ((feedbackRows as FeedbackRow[] | null) ?? []).map(mapFeedbackRow),
  };
}

export async function saveWorkspaceToSupabase(workspace: ClientWorkspace) {
  if (!supabase) throw new Error("Supabase nije konfiguriran.");
  const row = workspaceToRow(workspace);
  const { error } = await supabase.from("client_workspaces").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteWorkspaceFromSupabase(workspaceId: string) {
  if (!supabase) throw new Error("Supabase nije konfiguriran.");

  const { error } = await supabase.from("client_workspaces").delete().eq("id", workspaceId);
  if (error) throw error;
}

export async function saveWorkspaceSnapshot(workspaces: ClientWorkspace[], feedbackEntries: FeedbackEntry[]) {
  if (!supabase) throw new Error("Supabase nije konfiguriran.");

  const workspaceRows = workspaces.map(workspaceToRow);
  const workspaceIds = workspaces.map((workspace) => workspace.id);

  const { error: workspaceError } = await supabase.from("client_workspaces").upsert(workspaceRows, { onConflict: "id" });
  if (workspaceError) throw workspaceError;

  if (workspaceIds.length) {
    await supabase.from("workspace_messages").delete().in("workspace_id", workspaceIds);
    await supabase.from("workspace_feedback").delete().in("workspace_id", workspaceIds);
  }

  const messagesPayload = workspaces.flatMap((workspace) =>
    workspace.messages.map((message) => ({
      workspace_id: workspace.id,
      from_role: message.from,
      text: message.text,
      attachment: message.attachment ?? null,
    })),
  );

  if (messagesPayload.length) {
    const { error: messageInsertError } = await supabase.from("workspace_messages").insert(messagesPayload);
    if (messageInsertError) throw messageInsertError;
  }

  const feedbackPayload = feedbackEntries.map((entry) => ({
    workspace_id: entry.workspaceId,
    author: entry.author,
    role: entry.role,
    ratings: entry.ratings,
    notes: entry.notes,
    recommend: entry.recommend,
  }));

  if (feedbackPayload.length) {
    const { error: feedbackInsertError } = await supabase.from("workspace_feedback").insert(feedbackPayload);
    if (feedbackInsertError) throw feedbackInsertError;
  }
}

export async function sendWorkspaceMessage(options: {
  workspaceId: string;
  inviteToken?: string;
  from: MessageItem["from"];
  text: string;
  attachment?: string;
}) {
  if (!supabase) throw new Error("Supabase nije konfiguriran.");

  if (options.from === "client" && options.inviteToken) {
    const { data, error } = await supabase.rpc("add_client_message_by_invite", {
      invite_token_input: options.inviteToken,
      message_text: options.text,
      attachment_input: options.attachment ?? null,
    });
    if (error) throw error;
    if (data) {
      return {
        id: String((data as Record<string, unknown>).id),
        from: "client" as const,
        text: String((data as Record<string, unknown>).text ?? options.text),
        time: String((data as Record<string, unknown>).time ?? "00:00"),
        attachment: typeof (data as Record<string, unknown>).attachment === "string" ? String((data as Record<string, unknown>).attachment) : undefined,
      };
    }
  }

  const { data, error } = await supabase
    .from("workspace_messages")
    .insert({
      workspace_id: options.workspaceId,
      from_role: options.from,
      text: options.text,
      attachment: options.attachment ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapMessageRow(data as MessageRow);
}

export async function submitWorkspaceFeedback(options: {
  workspaceId: string;
  inviteToken?: string;
  author: string;
  role: string;
  ratings: FeedbackEntry["ratings"];
  notes: string;
  recommend: boolean;
}) {
  if (!supabase) throw new Error("Supabase nije konfiguriran.");

  if (options.inviteToken) {
    const { data, error } = await supabase.rpc("add_feedback_by_invite", {
      invite_token_input: options.inviteToken,
      author_input: options.author,
      role_input: options.role,
      ratings_input: options.ratings,
      notes_input: options.notes,
      recommend_input: options.recommend,
    });
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("workspace_feedback")
    .insert({
      workspace_id: options.workspaceId,
      author: options.author,
      role: options.role,
      ratings: options.ratings,
      notes: options.notes,
      recommend: options.recommend,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapFeedbackRow(data as FeedbackRow);
}

export async function uploadPublicAsset(bucket: "renders" | "documents" | "models", file: File, workspaceId: string) {
  if (!supabase) throw new Error("Supabase nije konfiguriran.");

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "-").toLowerCase();
  const path = `${workspaceId}/${Date.now()}-${safeName || `asset.${extension}`}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return {
    path,
    publicUrl: data.publicUrl,
  };
}

export async function seedDemoSnapshotToSupabase() {
  await saveWorkspaceSnapshot(initialWorkspaces, initialFeedback);
}
