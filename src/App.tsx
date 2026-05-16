import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Float, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import type { Session } from "@supabase/supabase-js";
import * as THREE from "three";
import { initialFeedback, initialWorkspaces, uid } from "./data/demo";
import { readStorage, writeStorage } from "./lib/storage";
import { getSupabaseSession, isSupabaseConfigured, requestMagicLink, signOutSupabase, supabase } from "./lib/supabase";
import {
  deleteWorkspaceFromSupabase,
  loadStudioSnapshot,
  loadWorkspaceByInvite,
  loadWorkspaceForCurrentUser,
  saveWorkspaceSnapshot,
  saveWorkspaceToSupabase,
  seedDemoSnapshotToSupabase,
  sendWorkspaceMessage,
  submitWorkspaceFeedback,
  uploadPublicAsset,
} from "./lib/workspaceApi";
import type { AppView, ClientWorkspace, FeedbackEntry, MessageItem, ModuleKey } from "./types";
import { GLBModel } from "./components/GLBModel";

type RenderCategory = "eksterijer" | "interijer" | "detalji";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const WORKSPACES_KEY = "arstudio.workspaces";
const FEEDBACK_KEY = "arstudio.feedback";
const SELECTED_KEY = "arstudio.selected-workspace";

function ModernVilla({ mode }: { mode: "exterior" | "interior" }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current && mode === "exterior") {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.12) * 0.03;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.5, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#111517" roughness={0.95} />
      </mesh>

      <mesh position={[-3.2, 0.02, 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.2, 3.3]} />
        <meshStandardMaterial color="#0284c7" transparent opacity={0.82} metalness={0.9} roughness={0.14} />
      </mesh>
      <mesh position={[-3.2, -0.08, 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.5, 3.6]} />
        <meshStandardMaterial color="#0f172a" roughness={1} />
      </mesh>

      <group position={[0.2, 0, -0.7]}>
        <mesh castShadow receiveShadow position={[0, 0.85, 0]}>
          <boxGeometry args={[6.2, 1.7, 4.1]} />
          <meshStandardMaterial color="#d6d3d1" roughness={0.75} metalness={0.08} />
        </mesh>

        <mesh position={[0, 0.85, 2.08]}>
          <boxGeometry args={[5.6, 1.5, 0.05]} />
          <meshPhysicalMaterial color="#bae6fd" transparent opacity={0.16} transmission={0.92} roughness={0.05} metalness={0.8} />
        </mesh>

        <mesh position={[3.13, 0.85, 0.3]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[3.2, 1.5, 0.05]} />
          <meshPhysicalMaterial color="#dbeafe" transparent opacity={0.16} transmission={0.92} roughness={0.06} />
        </mesh>

        <mesh castShadow receiveShadow position={[1.15, 2.28, -0.2]}>
          <boxGeometry args={[4.7, 1.25, 3.1]} />
          <meshStandardMaterial color="#e7e5e4" roughness={0.84} />
        </mesh>
        <mesh position={[1.15, 2.28, 1.37]}>
          <boxGeometry args={[4.12, 1.05, 0.05]} />
          <meshPhysicalMaterial color="#e0f2fe" transparent opacity={0.18} transmission={0.95} />
        </mesh>
        <mesh castShadow position={[0.7, 2.95, -0.15]}>
          <boxGeometry args={[7, 0.16, 4.6]} />
          <meshStandardMaterial color="#27272a" roughness={0.9} />
        </mesh>

        <pointLight position={[0.3, 1.1, 1]} intensity={1.5} color="#fde68a" distance={8} />
        <pointLight position={[1.4, 2.2, 0.4]} intensity={1.1} color="#fef3c7" distance={7} />
        <spotLight position={[-1.8, 3.2, 3]} angle={0.58} penumbra={0.6} intensity={2.2} color="#fbbf24" castShadow />
      </group>

      <mesh position={[-1.2, 0.04, 2.6]} receiveShadow>
        <boxGeometry args={[8.2, 0.1, 2.15]} />
        <meshStandardMaterial color="#3f3f46" roughness={0.85} />
      </mesh>

      {[
        [-6.4, 0, -3],
        [-5.2, 0, 4],
        [5.2, 0, -3.8],
        [6, 0, 3.2],
      ].map((position, index) => (
        <group key={index} position={position as [number, number, number]}>
          <mesh position={[0, 0.82, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.12, 1.65]} />
            <meshStandardMaterial color="#57534e" />
          </mesh>
          <mesh position={[0, 1.8, 0]} castShadow>
            <coneGeometry args={[0.92, 1.8, 10]} />
            <meshStandardMaterial color="#14532d" roughness={0.95} />
          </mesh>
        </group>
      ))}

      {[-1.7, -0.6].map((x, index) => (
        <group key={index} position={[x, 0.1, 3.2]} rotation={[0, -0.35, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.8, 0.15, 1.45]} />
            <meshStandardMaterial color="#18181b" />
          </mesh>
          <mesh position={[0, 0.13, -0.52]}>
            <boxGeometry args={[0.8, 0.3, 0.2]} />
            <meshStandardMaterial color="#18181b" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Scene3D({ mode, glbUrl }: { mode: "exterior" | "interior"; glbUrl?: string }) {
  return (
    <>
      <PerspectiveCamera makeDefault position={mode === "exterior" ? [7, 4, 7] : [0, 1.7, 2.6]} fov={45} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} color="#cbd5e1" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      {glbUrl ? (
        <Suspense fallback={null}>
          <GLBModel url={glbUrl} />
        </Suspense>
      ) : (
        <>
          <Environment preset="night" />
          <Float speed={0.5} floatIntensity={0} rotationIntensity={0}>
            <ModernVilla mode={mode} />
          </Float>
          <ContactShadows position={[0, -0.48, 0]} opacity={0.6} blur={2.4} scale={20} far={5} />
        </>
      )}
      <OrbitControls enablePan={false} minDistance={mode === "exterior" ? 4 : 2} maxDistance={12} maxPolarAngle={Math.PI / 2.02} target={mode === "exterior" ? [0, 1, 0] : [0.2, 1.4, -0.7]} />
      <fog attach="fog" args={["#020617", 12, 22]} />
    </>
  );
}

function RatingRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] mb-2">
        <span>{label}</span>
        <span className="text-white/45">{value.toFixed(1)}/5</span>
      </div>
      <div className="h-2 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full rounded-full bg-white" style={{ width: `${(value / 5) * 100}%` }} />
      </div>
    </div>
  );
}

export default function App() {
  const [workspaces, setWorkspaces] = useState<ClientWorkspace[]>(() => readStorage(WORKSPACES_KEY, initialWorkspaces));
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>(() => readStorage(FEEDBACK_KEY, initialFeedback));
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(() => readStorage(SELECTED_KEY, initialWorkspaces[0].id));
  const [view, setView] = useState<AppView>("landing");
  const [accessLevel, setAccessLevel] = useState<"none" | "invite" | "user" | "studio">("none");
  const [creatorMode, setCreatorMode] = useState(false);
  const [renderTab, setRenderTab] = useState<RenderCategory>("eksterijer");
  const [modelMode, setModelMode] = useState<"exterior" | "interior">("exterior");
  const [chatDraft, setChatDraft] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [inviteTokenInput, setInviteTokenInput] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissInstall, setDismissInstall] = useState(false);
  const [isRemoteBusy, setIsRemoteBusy] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState<string>(isSupabaseConfigured ? "Supabase povezivanje je spremno." : "Aplikacija radi u lokalnom demo modu.");
  const [lastRemoteSync, setLastRemoteSync] = useState("");
  const [showDeleteClient, setShowDeleteClient] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showRemoveApp, setShowRemoveApp] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ render: File | null; document: File | null; model: File | null }>({
    render: null,
    document: null,
    model: null,
  });
  const [feedbackForm, setFeedbackForm] = useState({
    author: "",
    role: "Employee",
    design: 5,
    navigation: 4,
    model: 5,
    renders: 4,
    notes: "",
    recommend: true,
  });
  const [studioForm, setStudioForm] = useState({
    renderTitle: "",
    renderUrl: "",
    renderCategory: "eksterijer" as RenderCategory,
    documentName: "",
    documentType: "PDF",
    documentSize: "1.0 MB",
    publishMessage: "",
    newClientName: "",
    newClientEmail: "",
    featureText: "",
  });

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === selectedWorkspaceId) ?? workspaces[0],
    [workspaces, selectedWorkspaceId],
  );

  const workspaceFeedback = useMemo(
    () => feedbackEntries.filter((entry) => entry.workspaceId === workspace.id),
    [feedbackEntries, workspace.id],
  );

  const feedbackAverage = useMemo(() => {
    if (!workspaceFeedback.length) return 0;
    const total = workspaceFeedback.reduce(
      (sum, entry) => sum + entry.ratings.design + entry.ratings.navigation + entry.ratings.model + entry.ratings.renders,
      0,
    );
    return total / (workspaceFeedback.length * 4);
  }, [workspaceFeedback]);

  const categoryRenders = useMemo(
    () => workspace.renders.filter((item) => item.category === renderTab),
    [workspace.renders, renderTab],
  );

  const inviteLink = `${window.location.origin}?invite=${workspace.inviteToken}`;
  const pwaReady = Boolean(installEvent) && !dismissInstall;

  useEffect(() => {
    writeStorage(WORKSPACES_KEY, workspaces);
  }, [workspaces]);

  useEffect(() => {
    writeStorage(FEEDBACK_KEY, feedbackEntries);
  }, [feedbackEntries]);

  useEffect(() => {
    writeStorage(SELECTED_KEY, selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    // Detect if running as installed PWA
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(standalone);
  }, []);

  useEffect(() => {
    setModelMode(workspace.model.mode);
  }, [workspace.id, workspace.model.mode]);

  // Auto-load project if opened from installed app icon
  useEffect(() => {
    if (isStandalone && view === "landing") {
      const savedToken = localStorage.getItem("arstudio.pwa-invite-token");
      if (savedToken) {
        setInviteTokenInput(savedToken);
        // Small delay to ensure state is ready
        setTimeout(() => {
          const cleanedToken = savedToken.trim().toUpperCase();
          const match = workspaces.find((item) => item.inviteToken.toUpperCase() === cleanedToken);
          if (match) {
            setSelectedWorkspaceId(match.id);
            setAccessLevel("invite");
            setCreatorMode(false);
            setView("dashboard");
            setAuthNotice(`Dobrodošli natrag, ${match.name}.`);
          }
        }, 300);
      }
    }
  }, [isStandalone, view, workspaces]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (!invite) return;

    let cancelled = false;

    const openInvite = async () => {
      if (isSupabaseConfigured) {
        const remoteWorkspace = await loadInviteWorkspaceFromRemote(invite);
        if (!cancelled && remoteWorkspace) {
          setCreatorMode(false);
          setView("dashboard");
          setAuthNotice(`Otvoren je privatni link za ${remoteWorkspace.name}.`);
          return;
        }
      }

      const match = initialWorkspaces.find((item) => item.inviteToken.toUpperCase() === invite.toUpperCase()) ?? workspaces.find((item) => item.inviteToken.toUpperCase() === invite.toUpperCase());
      if (!cancelled && match) {
        setSelectedWorkspaceId(match.id);
        setCreatorMode(false);
        setView("dashboard");
        setAuthNotice(`Otvoren je privatni link za ${match.name}.`);
      }
    };

    void openInvite();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    getSupabaseSession().then(setSession);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const email = session?.user.email?.toLowerCase();
    if (!email) return;

    let cancelled = false;

    const loadWorkspaceForSession = async () => {
      if (isSupabaseConfigured) {
        const remoteWorkspace = await loadSessionWorkspaceFromRemote();
        if (!cancelled && remoteWorkspace) {
          setAccessLevel("user");
          setCreatorMode(false);
          setView((current) => (current === "landing" ? "dashboard" : current));
          setAuthNotice(`Prijavljeni ste kao ${remoteWorkspace.email}.`);
          return;
        }
      }

      const matchingWorkspace = workspaces.find((item) => item.email.toLowerCase() === email);
      if (!cancelled && matchingWorkspace) {
        setSelectedWorkspaceId(matchingWorkspace.id);
        setAccessLevel("user");
        setCreatorMode(false);
        setView((current) => (current === "landing" ? "dashboard" : current));
        setAuthNotice(`Prijavljeni ste kao ${matchingWorkspace.email}.`);
      }
    };

    void loadWorkspaceForSession();
    return () => {
      cancelled = true;
    };
  }, [session?.user.email]);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured || view === "landing") return;
    const realtimeClient = supabase;

    const refreshRemoteState = async () => {
      if (creatorMode) {
        await loadStudioFromRemote();
        return;
      }

      const invite = new URLSearchParams(window.location.search).get("invite") || workspace.inviteToken;
      if (invite) {
        await loadInviteWorkspaceFromRemote(invite);
        return;
      }

      if (session?.user.email) {
        await loadSessionWorkspaceFromRemote();
      }
    };

    const channel = realtimeClient
      .channel(`arstudio-live-${creatorMode ? "studio" : workspace.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_workspaces" }, () => {
        void refreshRemoteState();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_messages" }, () => {
        void refreshRemoteState();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_feedback" }, () => {
        if (creatorMode) {
          void refreshRemoteState();
        }
      })
      .subscribe();

    return () => {
      void realtimeClient.removeChannel(channel);
    };
  }, [creatorMode, session?.user.email, view, workspace.id, workspace.inviteToken]);

  useEffect(() => {
    if (view === "landing") return;

    const protectedViews: AppView[] = ["dashboard", "model", "renders", "docs", "chat", "feedback", "studio"];
    if (protectedViews.includes(view)) {
      if (view === "studio" && accessLevel !== "studio") {
        setView("landing");
        setAuthNotice("Pristup Creator Studiju je ograničen.");
        return;
      }
      if (accessLevel === "none") {
        setView("landing");
        setAuthNotice("Pristup odbijen. Molimo prijavite se ili unesite invite token.");
        return;
      }
    }
  }, [view, accessLevel]);

  const mutateWorkspace = (workspaceId: string, updater: (current: ClientWorkspace) => ClientWorkspace) => {
    setWorkspaces((previous) => previous.map((item) => (item.id === workspaceId ? updater(item) : item)));
  };

  const upsertWorkspace = (nextWorkspace: ClientWorkspace) => {
    setWorkspaces((previous) => {
      const exists = previous.some((item) => item.id === nextWorkspace.id);
      return exists ? previous.map((item) => (item.id === nextWorkspace.id ? nextWorkspace : item)) : [nextWorkspace, ...previous];
    });
  };

  const stampRemoteStatus = (message: string) => {
    setRemoteStatus(message);
    setLastRemoteSync(new Date().toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" }));
  };

  const getErrorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

  const loadStudioFromRemote = async () => {
    if (!isSupabaseConfigured) {
      setRemoteStatus("Dodajte Supabase ključeve za studio sinkronizaciju.");
      return;
    }

    setIsRemoteBusy(true);
    try {
      const snapshot = await loadStudioSnapshot();
      if (snapshot.workspaces.length) {
        setWorkspaces(snapshot.workspaces);
        setFeedbackEntries(snapshot.feedbackEntries);
        setSelectedWorkspaceId((current) => (snapshot.workspaces.some((item) => item.id === current) ? current : snapshot.workspaces[0].id));
        stampRemoteStatus(`Studio podaci učitani iz Supabase (${snapshot.workspaces.length} workspace-a).`);
      } else {
        stampRemoteStatus("Supabase je prazan. Možete pushati lokalne demo podatke.");
      }
    } catch (error) {
      setRemoteStatus(getErrorMessage(error, "Studio snapshot nije moguće učitati."));
    } finally {
      setIsRemoteBusy(false);
    }
  };

  const loadInviteWorkspaceFromRemote = async (inviteToken: string) => {
    if (!isSupabaseConfigured) return null;

    setIsRemoteBusy(true);
    try {
      const remoteWorkspace = await loadWorkspaceByInvite(inviteToken);
      if (remoteWorkspace) {
        upsertWorkspace(remoteWorkspace);
        setSelectedWorkspaceId(remoteWorkspace.id);
        stampRemoteStatus(`Privatni workspace učitan iz Supabase za ${remoteWorkspace.name}.`);
      }
      return remoteWorkspace;
    } catch (error) {
      setRemoteStatus(getErrorMessage(error, "Privatni workspace nije moguće učitati."));
      return null;
    } finally {
      setIsRemoteBusy(false);
    }
  };

  const loadSessionWorkspaceFromRemote = async () => {
    if (!isSupabaseConfigured || !session?.user.email) return null;

    setIsRemoteBusy(true);
    try {
      const remoteWorkspace = await loadWorkspaceForCurrentUser();
      if (remoteWorkspace) {
        upsertWorkspace(remoteWorkspace);
        setSelectedWorkspaceId(remoteWorkspace.id);
        stampRemoteStatus(`Workspace za ${remoteWorkspace.email} učitan iz Supabase.`);
      }
      return remoteWorkspace;
    } catch (error) {
      setRemoteStatus(getErrorMessage(error, "Korisnički workspace nije moguće učitati."));
      return null;
    } finally {
      setIsRemoteBusy(false);
    }
  };

  const saveCurrentWorkspaceRemote = async () => {
    if (!isSupabaseConfigured) {
      setRemoteStatus("Supabase nije konfiguriran. Spremanje ostaje lokalno.");
      return;
    }

    setIsRemoteBusy(true);
    try {
      await saveWorkspaceToSupabase(workspace);
      stampRemoteStatus(`Workspace ${workspace.name} spremljen u Supabase.`);
    } catch (error) {
      setRemoteStatus(getErrorMessage(error, "Spremanje workspace-a nije uspjelo."));
    } finally {
      setIsRemoteBusy(false);
    }
  };

  const pushLocalSnapshotToRemote = async () => {
    if (!isSupabaseConfigured) {
      setRemoteStatus("Supabase nije konfiguriran. Snapshot je samo lokalni.");
      return;
    }

    setIsRemoteBusy(true);
    try {
      await saveWorkspaceSnapshot(workspaces, feedbackEntries);
      stampRemoteStatus("Cijeli lokalni snapshot pushan je u Supabase.");
    } catch (error) {
      setRemoteStatus(getErrorMessage(error, "Push lokalnog snapshota nije uspio."));
    } finally {
      setIsRemoteBusy(false);
    }
  };

  const seedRemoteDemoData = async () => {
    if (!isSupabaseConfigured) {
      setRemoteStatus("Supabase nije konfiguriran. Seed nije moguć.");
      return;
    }

    setIsRemoteBusy(true);
    try {
      await seedDemoSnapshotToSupabase();
      stampRemoteStatus("Demo workspace-i i feedback seedani su u Supabase.");
      await loadStudioFromRemote();
    } catch (error) {
      setRemoteStatus(getErrorMessage(error, "Seed demo podataka nije uspio."));
    } finally {
      setIsRemoteBusy(false);
    }
  };

  const uploadSelectedAsset = async (kind: "render" | "document" | "model") => {
    const file = pendingFiles[kind];
    if (!file) {
      setRemoteStatus("Najprije odaberite datoteku za upload.");
      return;
    }
    if (!isSupabaseConfigured) {
      setRemoteStatus("Supabase storage nije konfiguriran.");
      return;
    }

    setIsRemoteBusy(true);
    try {
      const bucket = kind === "render" ? "renders" : kind === "document" ? "documents" : "models";
      const uploaded = await uploadPublicAsset(bucket, file, workspace.id);

      if (kind === "render") {
        setStudioForm((current) => ({ ...current, renderUrl: uploaded.publicUrl }));
        stampRemoteStatus("Render je uploadan. URL je ubačen u render formu — zatim kliknite Objavi.");
      }

      if (kind === "document") {
        mutateWorkspace(workspace.id, (current) => ({
          ...current,
          documents: [
            {
              id: uid(),
              name: file.name,
              type: file.name.split(".").pop()?.toUpperCase() || "FILE",
              size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
              date: new Date().toLocaleDateString("hr-HR"),
              locked: false,
              url: uploaded.publicUrl,
            },
            ...current.documents,
          ],
        }));
        stampRemoteStatus("Dokument je uploadan i dodan lokalno. Kliknite Save workspace za spremanje metapodataka.");
      }

      if (kind === "model") {
        mutateWorkspace(workspace.id, (current) => ({
          ...current,
          model: {
            ...current.model,
            glbUrl: uploaded.publicUrl,
          },
        }));
        stampRemoteStatus("3D model je uploadan i vezan uz workspace. Kliknite Save workspace za spremanje.");
      }

      setPendingFiles((current) => ({ ...current, [kind]: null }));
    } catch (error) {
      setRemoteStatus(getErrorMessage(error, "Upload nije uspio."));
    } finally {
      setIsRemoteBusy(false);
    }
  };

  const removeCurrentWorkspace = async () => {
    if (workspaces.length <= 1) {
      setRemoteStatus("Ne možete obrisati zadnjeg klijenta. Prvo kreirajte novi workspace.");
      setShowDeleteClient(false);
      return;
    }

    const workspaceId = workspace.id;
    const workspaceName = workspace.name;
    const nextWorkspace = workspaces.find((item) => item.id !== workspaceId);

    setIsRemoteBusy(true);
    try {
      if (isSupabaseConfigured) {
        await deleteWorkspaceFromSupabase(workspaceId);
      }

      setWorkspaces((previous) => previous.filter((item) => item.id !== workspaceId));
      setFeedbackEntries((previous) => previous.filter((entry) => entry.workspaceId !== workspaceId));

      if (nextWorkspace) {
        setSelectedWorkspaceId(nextWorkspace.id);
      }

      setShowDeleteClient(false);
      stampRemoteStatus(`${workspaceName} je uklonjen${isSupabaseConfigured ? " iz Supabase i lokalnog prikaza" : " lokalno"}.`);
      setView("studio");
    } catch (error) {
      setRemoteStatus(getErrorMessage(error, "Brisanje klijenta nije uspjelo."));
    } finally {
      setIsRemoteBusy(false);
    }
  };

  const toggleModule = (key: ModuleKey, enabled: boolean) => {
    mutateWorkspace(workspace.id, (current) => ({
      ...current,
      modules: {
        ...current.modules,
        [key]: enabled,
      },
    }));
  };

  const enterWithInvite = async () => {
    const cleanedToken = inviteTokenInput.trim().toUpperCase();
    if (!cleanedToken) {
      setAuthNotice("Unesite invite token.");
      return;
    }

    if (isSupabaseConfigured) {
      const remoteWorkspace = await loadInviteWorkspaceFromRemote(cleanedToken);
      if (remoteWorkspace) {
        setAccessLevel("invite");
        setCreatorMode(false);
        setView("dashboard");
        setAuthNotice(`Privatni portal otvoren za ${remoteWorkspace.name}.`);
        return;
      }
    }

    const match = workspaces.find((item) => item.inviteToken.toUpperCase() === cleanedToken);
    if (!match) {
      setAuthNotice("Invite token nije pronađen. Koristite primjer: SLA-2026-AR");
      return;
    }

    setSelectedWorkspaceId(match.id);
    setAccessLevel("invite");
    setCreatorMode(false);
    setView("dashboard");
    setAuthNotice(`Privatni portal otvoren za ${match.name}.`);
  };

  const openWorkspace = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setView("dashboard");
  };

  const openCreatorStudio = async () => {
    setAccessLevel("studio");
    setCreatorMode(true);
    setView("studio");
    if (isSupabaseConfigured) {
      await loadStudioFromRemote();
    }
  };

  const handleMagicLink = async () => {
    if (!magicEmail.trim()) {
      setAuthNotice("Unesite email adresu za magic link.");
      return;
    }

    if (!isSupabaseConfigured) {
      setAuthNotice("Supabase nije konfiguriran. Dodajte VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY za stvarni login.");
      return;
    }

    const { error } = await requestMagicLink(magicEmail.trim());
    if (error) {
      setAuthNotice(error.message);
      return;
    }

    setAuthNotice(`Magic link je poslan na ${magicEmail.trim()}.`);
  };

  const installApp = async () => {
    if (!installEvent) return;
    // Save the current invite token so the app opens directly to this project next time
    localStorage.setItem("arstudio.pwa-invite-token", workspace.inviteToken);
    await installEvent.prompt();
    const result = await installEvent.userChoice;
    if (result.outcome === "accepted") {
      setInstallEvent(null);
      setDismissInstall(true);
    }
  };

  const signOut = async () => {
    await signOutSupabase();
    setCreatorMode(false);
    setView("landing");
    setAuthNotice("");
    setChatDraft("");
  };

  const sendChatMessage = async () => {
    if (!chatDraft.trim()) return;

    const text = chatDraft.trim();
    const stamp = new Date().toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" });
    const workspaceId = workspace.id;
    const from: MessageItem["from"] = creatorMode ? "studio" : "client";
    const localMessage: MessageItem = { id: uid(), from, text, time: stamp };

    mutateWorkspace(workspaceId, (current) => ({
      ...current,
      messages: [...current.messages, localMessage],
    }));
    setChatDraft("");

    if (isSupabaseConfigured) {
      try {
        const remoteMessage = await sendWorkspaceMessage({
          workspaceId,
          inviteToken: from === "client" ? workspace.inviteToken : undefined,
          from,
          text,
        });
        mutateWorkspace(workspaceId, (current) => ({
          ...current,
          messages: [...current.messages.filter((message) => message.id !== localMessage.id), remoteMessage],
        }));
        stampRemoteStatus(`Nova poruka spremljena u Supabase za ${workspace.name}.`);
      } catch (error) {
        setRemoteStatus(getErrorMessage(error, "Poruku nije moguće spremiti u Supabase."));
      }
    }

    if (!creatorMode && !isSupabaseConfigured) {
      window.setTimeout(() => {
        mutateWorkspace(workspaceId, (current) => ({
          ...current,
          messages: [...current.messages, { id: uid(), from: "studio", text: "Hvala na poruci. Pregledavam i javljam se uskoro s novom verzijom.", time: new Date().toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" }) }],
        }));
      }, 950);
    }
  };

  const submitFeedback = async () => {
    const entry: FeedbackEntry = {
      id: uid(),
      workspaceId: workspace.id,
      author: feedbackForm.author.trim() || "Anonymous reviewer",
      role: feedbackForm.role.trim() || "Employee",
      ratings: {
        design: feedbackForm.design,
        navigation: feedbackForm.navigation,
        model: feedbackForm.model,
        renders: feedbackForm.renders,
      },
      notes: feedbackForm.notes.trim(),
      recommend: feedbackForm.recommend,
      submittedAt: new Date().toLocaleString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    };

    setFeedbackEntries((previous) => [entry, ...previous]);

    if (isSupabaseConfigured) {
      try {
        await submitWorkspaceFeedback({
          workspaceId: workspace.id,
          inviteToken: creatorMode ? undefined : workspace.inviteToken,
          author: entry.author,
          role: entry.role,
          ratings: entry.ratings,
          notes: entry.notes,
          recommend: entry.recommend,
        });
        stampRemoteStatus(`Feedback je spremljen u Supabase za ${workspace.name}.`);
      } catch (error) {
        setRemoteStatus(getErrorMessage(error, "Feedback nije moguće spremiti u Supabase."));
      }
    }

    setFeedbackForm({
      author: "",
      role: "Employee",
      design: 5,
      navigation: 4,
      model: 5,
      renders: 4,
      notes: "",
      recommend: true,
    });
    setView(creatorMode ? "studio" : "dashboard");
  };

  const createWorkspace = () => {
    const id = `client-${uid()}`;
    const initials = (studioForm.newClientName || "NK")
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const newWorkspace: ClientWorkspace = {
      ...initialWorkspaces[0],
      id,
      inviteToken: `INV-${uid().toUpperCase()}`,
      name: studioForm.newClientName.trim() || "Novi klijent",
      email: studioForm.newClientEmail.trim() || `${id}@demo.local`,
      avatar: initials || "NK",
      project: {
        title: "Novi projekt",
        subtitle: "Pripremljen za personalizaciju i objavu",
        progress: 10,
        image: "/images/hero-house.jpg",
      },
      messages: [{ id: uid(), from: "studio", text: "Dobrodošli u vaš privatni portal projekta.", time: "08:45" }],
      customNote: "Odaberite koji moduli i materijali će biti vidljivi ovom klijentu.",
    };

    setWorkspaces((previous) => [newWorkspace, ...previous]);
    setSelectedWorkspaceId(id);
    setStudioForm((current) => ({ ...current, newClientName: "", newClientEmail: "" }));
  };

  const duplicateWorkspace = () => {
    const cloneId = `copy-${uid()}`;
    const duplicated: ClientWorkspace = {
      ...workspace,
      id: cloneId,
      inviteToken: `INV-${uid().toUpperCase()}`,
      name: `${workspace.name} Copy`,
      email: `copy-${cloneId}@demo.local`,
      messages: [...workspace.messages],
      documents: [...workspace.documents],
      renders: [...workspace.renders],
      portfolio: [...workspace.portfolio],
      offer: { ...workspace.offer, features: [...workspace.offer.features] },
      project: { ...workspace.project },
      model: { ...workspace.model, notes: [...workspace.model.notes] },
      modules: { ...workspace.modules },
    };

    setWorkspaces((previous) => [duplicated, ...previous]);
    setSelectedWorkspaceId(cloneId);
  };

  const addOfferFeature = () => {
    if (!studioForm.featureText.trim()) return;
    mutateWorkspace(workspace.id, (current) => ({
      ...current,
      offer: {
        ...current.offer,
        features: [...current.offer.features, studioForm.featureText.trim()],
      },
    }));
    setStudioForm((current) => ({ ...current, featureText: "" }));
  };

  const addRender = () => {
    if (!studioForm.renderTitle.trim() || !studioForm.renderUrl.trim()) return;
    mutateWorkspace(workspace.id, (current) => ({
      ...current,
      renders: [
        {
          id: uid(),
          title: studioForm.renderTitle.trim(),
          image: studioForm.renderUrl.trim(),
          category: studioForm.renderCategory,
          stage: "Published",
        },
        ...current.renders,
      ],
    }));
    setStudioForm((current) => ({ ...current, renderTitle: "", renderUrl: "", renderCategory: "eksterijer" }));
  };

  const addDocument = () => {
    if (!studioForm.documentName.trim()) return;
    mutateWorkspace(workspace.id, (current) => ({
      ...current,
      documents: [
        {
          id: uid(),
          name: studioForm.documentName.trim(),
          type: studioForm.documentType,
          size: studioForm.documentSize,
          date: new Date().toLocaleDateString("hr-HR"),
          locked: false,
        },
        ...current.documents,
      ],
    }));
    setStudioForm((current) => ({ ...current, documentName: "", documentType: "PDF", documentSize: "1.0 MB" }));
  };

  const addStudioAnnouncement = () => {
    if (!studioForm.publishMessage.trim()) return;
    mutateWorkspace(workspace.id, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: uid(),
          from: "studio",
          text: studioForm.publishMessage.trim(),
          time: new Date().toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit" }),
        },
      ],
    }));
    setStudioForm((current) => ({ ...current, publishMessage: "" }));
  };

  const publishCurrentProjectToPortfolio = () => {
    mutateWorkspace(workspace.id, (current) => ({
      ...current,
      modules: { ...current.modules, portfolio: true },
      portfolio: [
        {
          id: uid(),
          title: current.project.title,
          subtitle: current.project.subtitle,
          image: current.project.image,
          year: new Date().getFullYear().toString(),
        },
        ...current.portfolio,
      ],
    }));
  };

  const recommendationRate = workspaceFeedback.length
    ? Math.round((workspaceFeedback.filter((entry) => entry.recommend).length / workspaceFeedback.length) * 100)
    : 0;

  const navItems: Array<{ id: AppView; label: string; icon: string; enabled: boolean; badge?: number }> = [
    { id: "dashboard", label: "Početna", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", enabled: true },
    { id: "model", label: "3D", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", enabled: workspace.modules.model },
    { id: "chat", label: "Chat", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", enabled: workspace.modules.chat, badge: workspace.messages.length },
    { id: "docs", label: "Dok", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", enabled: workspace.modules.documents },
    { id: creatorMode ? "studio" : "settings", label: creatorMode ? "Studio" : "Post", icon: creatorMode ? "M12 3v18M3 12h18" : "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z", enabled: true },
  ];

  return (
    <div className="min-h-screen bg-[#050507] text-white flex items-center justify-center px-4 py-8 lg:px-12">
      <div className="w-full max-w-[1180px] flex items-center justify-center lg:justify-between gap-10">
        <div className="w-full max-w-[420px] min-h-[860px] bg-[#0b0b0f] border border-white/6 rounded-[36px] overflow-hidden shadow-[0_30px_120px_rgba(0,0,0,0.55)] relative flex flex-col">
          <div className="h-11 flex items-center justify-between px-6 text-[15px] font-medium text-white/90 bg-black/40 backdrop-blur-xl relative z-40">
            <span>9:41</span>
            <div className="flex items-center gap-1.5">
              <svg width="18" height="12" viewBox="0 0 18 12"><path d="M1 5h2v2H1zM4 3h2v6H4zM7 1h2v10H7zM10 4h2v4h-2zM13 2h2v8h-2z" fill="currentColor" /></svg>
              <svg width="16" height="12" viewBox="0 0 16 12"><path d="M2 4a4 4 0 0 1 8 0v1h1a2 2 0 0 1 0 4H3a2 2 0 0 1 0-4h1V4z" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
              <div className="w-6 h-3 rounded-sm border border-white/70 relative"><div className="absolute inset-[2px] w-4 bg-white rounded-[1px]" /></div>
            </div>
          </div>

          {pwaReady && view !== "landing" && (
            <div className="mx-4 mt-4 rounded-2xl border border-[#9ca986]/30 bg-[#1a2018] px-4 py-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-[12px] uppercase tracking-widest text-[#b8c59f]">Install app</div>
                <div className="text-[13px] text-white/75 mt-1">Dodajte aplikaciju na početni zaslon za iskustvo kao pravi mobilni app.</div>
              </div>
              <button onClick={installApp} className="h-10 px-4 rounded-full bg-white text-black text-[13px] font-medium">Install</button>
              <button onClick={() => setDismissInstall(true)} className="text-white/50 text-sm">×</button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {view === "landing" && (
              <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 relative">
                <div className="absolute inset-0">
                  <img src="/images/hero-house.jpg" alt="Luxury house" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/40 to-[#0b0b0f]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0f] via-transparent to-transparent" />
                </div>
                <div className="relative z-10 h-full flex flex-col px-7 pt-14 pb-8">
                  <div className="text-center">
                    <div className="text-[56px] font-light tracking-[0.18em] leading-none" style={{ fontFamily: "serif" }}>AR</div>
                    <div className="mt-3 text-[11px] tracking-[0.32em] text-white/70">ANTONIO RADANOVIĆ</div>
                    <div className="text-[9px] tracking-[0.24em] text-white/40 mt-1">PRIVATE CLIENT EXPERIENCE</div>
                  </div>

                  <div className="mt-auto space-y-4">
                    <div>
                      <h1 className="text-[36px] leading-[1.05] font-light" style={{ fontFamily: "serif" }}>Vaš projekt. Vaš portal.</h1>
                      <p className="mt-3 text-[14px] text-white/72 leading-relaxed">
                        Instalabilna aplikacija za investitore s 3D pregledom, renderima, dokumentima, personaliziranim ponudama i direktnom komunikacijom.
                      </p>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-black/30 backdrop-blur-xl p-4 space-y-3">
                      <div className="text-[11px] uppercase tracking-widest text-[#b8c59f]">Client access</div>
                      <input value={inviteTokenInput} onChange={(event) => setInviteTokenInput(event.target.value)} placeholder="Unesite invite token" className="w-full h-11 rounded-xl bg-white/6 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      <button onClick={enterWithInvite} className="w-full h-11 rounded-full bg-white text-black text-[14px] font-medium">Otvori privatni portal</button>

                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {workspaces.map((item) => (
                          <button key={item.id} onClick={() => { setSelectedWorkspaceId(item.id); setCreatorMode(false); setView("dashboard"); }} className="rounded-2xl bg-white/5 border border-white/8 p-3 text-left hover:bg-white/10 transition">
                            <div className="w-8 h-8 rounded-full bg-[#2a2f28] flex items-center justify-center text-[12px] mb-2">{item.avatar}</div>
                            <div className="text-[12px] truncate">{item.name}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-black/25 backdrop-blur-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] uppercase tracking-widest text-[#b8c59f]">Magic link login</div>
                        <div className={`text-[11px] ${isSupabaseConfigured ? "text-emerald-300" : "text-white/40"}`}>{isSupabaseConfigured ? "Supabase ready" : "Demo mode"}</div>
                      </div>
                      <input value={magicEmail} onChange={(event) => setMagicEmail(event.target.value)} placeholder="investitor@email.com" className="w-full h-11 rounded-xl bg-white/6 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      <button onClick={handleMagicLink} className="w-full h-11 rounded-full bg-[#3a3f36] text-white text-[14px] font-medium hover:bg-[#444a40] transition">Pošalji magic link</button>
                    </div>

                    <button onClick={openCreatorStudio} className="w-full h-12 rounded-full border border-white/10 bg-white/5 text-[14px] hover:bg-white/10 transition">Otvori Creator Studio</button>
                    {authNotice && <div className="text-center text-[12px] text-white/60 leading-relaxed">{authNotice}</div>}
                  </div>
                </div>
              </motion.div>
            )}

            {view === "dashboard" && (
              <motion.div key="dashboard" initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} className="flex-1 overflow-y-auto px-5 pt-4 pb-8">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[14px] text-white/55">{workspace.welcome}</div>
                    <div className="text-[30px] font-light -mt-1" style={{ fontFamily: "serif" }}>{workspace.name}</div>
                    <div className="text-[12px] text-white/40 mt-1">{workspace.location ?? "Privatni pristup"}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setShowShare(true)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/8">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v14" /></svg>
                    </button>
                    <div className="w-10 h-10 rounded-full bg-[#2a2f28] flex items-center justify-center text-[13px] font-medium">{workspace.avatar}</div>
                  </div>
                </div>

                <div className="mt-7 rounded-[28px] overflow-hidden bg-[#141419] border border-white/6">
                  <div className="relative aspect-[16/10]">
                    <img src={workspace.project.image} alt={workspace.project.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.28em] text-white/45 mb-2">Aktivni projekt</div>
                          <h2 className="text-[25px] font-light" style={{ fontFamily: "serif" }}>{workspace.project.title}</h2>
                          <p className="text-[13px] text-white/72 mt-1 max-w-[240px]">{workspace.project.subtitle}</p>
                        </div>
                        <div className="relative w-16 h-16 shrink-0">
                          <svg className="transform -rotate-90 w-16 h-16">
                            <circle cx="32" cy="32" r="27" stroke="#ffffff20" strokeWidth="3" fill="none" />
                            <circle cx="32" cy="32" r="27" stroke="white" strokeWidth="3" fill="none" strokeDasharray={170} strokeDashoffset={170 - (170 * workspace.project.progress) / 100} strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-[12px] font-medium">{workspace.project.progress}%</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-white rounded-full" style={{ width: `${workspace.project.progress}%` }} />
                    </div>
                    <div className="mt-4 flex items-center justify-between text-[12px] text-white/55">
                      <span>Status: {workspace.status}</span>
                      <button onClick={() => setView("model")} className="text-white/80 hover:text-white">Otvori 3D pregled →</button>
                    </div>
                  </div>
                </div>

                <div className="mt-7">
                  <div className="text-[11px] uppercase tracking-widest text-white/40 mb-3">Brzi pristup</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: "model", label: "3D Model", desc: "Interaktivni pregled", action: () => setView("model"), icon: "cube", enabled: workspace.modules.model },
                      { key: "renders", label: "Renderi", desc: "Fotorealistični prikazi", action: () => setView("renders"), icon: "image", enabled: workspace.modules.renders },
                      { key: "documents", label: "Dokumenti", desc: "Ponude i preuzimanja", action: () => setView("docs"), icon: "file", enabled: workspace.modules.documents },
                      { key: "chat", label: "Komunikacija", desc: "Direktne poruke", action: () => setView("chat"), icon: "chat", enabled: workspace.modules.chat },
                    ].map((item) => (
                      <button key={item.key} onClick={item.action} disabled={!item.enabled} className="rounded-[22px] bg-[#141419] border border-white/6 p-4 text-left disabled:opacity-35 hover:bg-[#1a1a20] transition">
                        <div className="w-9 h-9 rounded-xl bg-white/6 flex items-center justify-center mb-4">
                          {item.icon === "cube" && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></svg>}
                          {item.icon === "image" && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>}
                          {item.icon === "file" && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>}
                          {item.icon === "chat" && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
                        </div>
                        <div className="text-[15px] font-medium">{item.label}</div>
                        <div className="text-[12px] text-white/50 mt-1">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {workspace.modules.offer && (
                  <div className="mt-6 rounded-[24px] bg-gradient-to-br from-[#1c221b] to-[#141419] border border-[#3a3f36]/40 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-widest text-[#b8c59f]">Personalizirana ponuda</div>
                        <div className="text-[18px] mt-1">{workspace.offer.title}</div>
                        <div className="text-[13px] text-white/58 mt-1">{workspace.offer.summary}</div>
                      </div>
                      <div className="text-[24px] font-light" style={{ fontFamily: "serif" }}>{workspace.offer.price}</div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {workspace.offer.features.slice(0, 3).map((feature) => (
                        <div key={feature} className="text-[13px] text-white/75 flex items-center gap-2"><span className="text-[#b8c59f]">•</span>{feature}</div>
                      ))}
                    </div>
                    <div className="mt-4 text-[12px] text-white/45">Vrijedi do {workspace.offer.validUntil}</div>
                  </div>
                )}

                <div className="mt-6 rounded-[24px] bg-[#141419] border border-white/6 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-[#b8c59f]">Individualno iskustvo</div>
                      <div className="text-[17px] mt-1">Što je vidljivo ovom klijentu</div>
                      <div className="text-[13px] text-white/58 mt-2 leading-relaxed">{workspace.customNote}</div>
                    </div>
                    {creatorMode && <button onClick={() => setView("studio")} className="px-3 py-1.5 rounded-full bg-white/6 text-[12px]">Uredi</button>}
                  </div>
                </div>

                {workspace.modules.portfolio && workspace.portfolio.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/40">Portfolio / Album</div>
                      <span className="text-[12px] text-white/45">{workspace.portfolio.length} spremljeno</span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {workspace.portfolio.map((item) => (
                        <div key={item.id} className="min-w-[220px] rounded-[24px] overflow-hidden bg-[#141419] border border-white/6">
                          <div className="h-36"><img src={item.image} alt={item.title} className="w-full h-full object-cover" /></div>
                          <div className="p-4">
                            <div className="text-[16px]">{item.title}</div>
                            <div className="text-[12px] text-white/55 mt-1">{item.subtitle}</div>
                            <div className="text-[11px] text-[#b8c59f] mt-3">{item.year}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={() => setView("feedback")} className="mt-6 w-full rounded-[24px] border border-white/10 bg-[#141419] p-4 text-left hover:bg-[#1a1a20] transition">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-[#b8c59f]">Interni feedback</div>
                      <div className="text-[16px] mt-1">Podijelite mišljenje prije slanja klijentima</div>
                      <div className="text-[13px] text-white/55 mt-1">Zaposlenici mogu ostaviti ocjene i komentare direktno u aplikaciji.</div>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-white/6 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                    </div>
                  </div>
                </button>
              </motion.div>
            )}

            {view === "model" && (
              <motion.div key="model" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                <div className="h-[56px] flex items-center justify-between px-4 border-b border-white/6 bg-black/30 backdrop-blur-xl">
                  <button onClick={() => setView("dashboard")} className="w-8 h-8 flex items-center justify-center -ml-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg></button>
                  <div className="text-[14px] uppercase tracking-widest font-medium">3D Model</div>
                  <button onClick={() => setShowShare(true)} className="w-8 h-8 flex items-center justify-center -mr-1"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg></button>
                </div>
                <div className="flex-1 relative bg-[#050507]">
                  <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
                    <Scene3D mode={modelMode} glbUrl={workspace.model.glbUrl} />
                  </Canvas>

                  <div className="absolute inset-x-4 bottom-24">
                    <div className="rounded-[26px] border border-white/10 bg-[#111217]/92 backdrop-blur-2xl p-4">
                      <div className="flex gap-6 text-[14px]">
                        <button onClick={() => setModelMode("exterior")} className={`pb-2 border-b-2 ${modelMode === "exterior" ? "border-white text-white" : "border-transparent text-white/50"}`}>Eksterijer</button>
                        <button onClick={() => setModelMode("interior")} className={`pb-2 border-b-2 ${modelMode === "interior" ? "border-white text-white" : "border-transparent text-white/50"}`}>Interijer</button>
                      </div>
                      <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
                        <div className="h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between px-4 text-[14px]">
                          <span>{workspace.model.floorLabel}</span>
                          <span className="text-white/40">{workspace.model.glbUrl ? "GLB attached" : "Procedural preview"}</span>
                        </div>
                        <button onClick={() => setView("renders")} className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {workspace.model.notes.map((note) => (
                          <span key={note} className="px-3 py-1.5 rounded-full bg-white/6 text-[11px] text-white/65">{note}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="absolute inset-x-4 bottom-4 rounded-[24px] border border-white/8 bg-[#0f1014]/90 backdrop-blur-2xl px-2 py-2">
                    <div className="flex justify-between">
                      {[
                        { label: "Orbit", icon: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 6a4 4 0 110 8 4 4 0 010-8z" },
                        { label: "Prikaz", icon: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z M12 9a3 3 0 100 6 3 3 0 000-6z" },
                        { label: "Mjerenje", icon: "M3 3v18h18 M7 16l3-3 3 3 4-4" },
                        { label: "Presjek", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
                        { label: "Info", icon: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 14v-4m0-4h.01" },
                      ].map((item) => (
                        <div key={item.label} className="flex flex-col items-center gap-1 px-2 py-1.5 text-white/58">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={item.icon} strokeLinecap="round" strokeLinejoin="round" /></svg>
                          <span className="text-[10.5px]">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === "renders" && (
              <motion.div key="renders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                <div className="h-[56px] flex items-center justify-between px-4 border-b border-white/6">
                  <button onClick={() => setView("dashboard")} className="w-8 h-8 flex items-center justify-center -ml-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg></button>
                  <div className="text-[14px] uppercase tracking-widest font-medium">Renderi</div>
                  <button onClick={() => setShowShare(true)} className="w-8 h-8 flex items-center justify-center -mr-1"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg></button>
                </div>
                <div className="px-5 pt-4 border-b border-white/5">
                  <div className="flex gap-6">
                    {(["eksterijer", "interijer", "detalji"] as RenderCategory[]).map((tab) => (
                      <button key={tab} onClick={() => setRenderTab(tab)} className={`pb-3 text-[14px] capitalize relative ${renderTab === tab ? "text-white" : "text-white/45"}`}>
                        {tab}
                        {renderTab === tab && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-white" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    {categoryRenders.map((item, index) => (
                      <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="rounded-[22px] overflow-hidden bg-[#141419] border border-white/6">
                        <div className="aspect-[4/3]"><img src={item.image} alt={item.title} className="w-full h-full object-cover" /></div>
                        <div className="p-3">
                          <div className="text-[14px]">{item.title}</div>
                          <div className="text-[11px] text-white/45 mt-1">{item.stage}</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {!categoryRenders.length && <div className="text-center text-white/40 py-20">Uskoro dostupno</div>}
                </div>
              </motion.div>
            )}

            {view === "docs" && (
              <motion.div key="docs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                <div className="h-[56px] flex items-center justify-between px-4 border-b border-white/6">
                  <button onClick={() => setView("dashboard")} className="w-8 h-8 flex items-center justify-center -ml-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg></button>
                  <div className="text-[14px] uppercase tracking-widest font-medium">Dokumenti</div>
                  <div className="w-8" />
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {workspace.documents.map((doc) => (
                    <div key={doc.id} className="rounded-[22px] bg-[#141419] border border-white/6 p-4 flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-white/6 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] truncate">{doc.name}</div>
                        <div className="text-[12px] text-white/45">{doc.type} • {doc.size} • {doc.date}</div>
                      </div>
                      <button className={`w-9 h-9 rounded-full flex items-center justify-center ${doc.locked ? "text-white/25" : "text-white/70"}`}>
                        {doc.locked ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>}
                      </button>
                    </div>
                  ))}
                  {!workspace.documents.length && <div className="text-center py-24 text-white/35">Nema dostupnih dokumenata.</div>}
                </div>
              </motion.div>
            )}

            {view === "chat" && (
              <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                <div className="h-[56px] flex items-center gap-3 px-4 border-b border-white/6">
                  <button onClick={() => setView("dashboard")} className="w-8 h-8 flex items-center justify-center -ml-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg></button>
                  <div className="w-8 h-8 rounded-full bg-[#2a2f28] flex items-center justify-center text-[12px]">AR</div>
                  <div>
                    <div className="text-[14px] leading-tight">Antonio Radanović</div>
                    <div className="text-[11px] text-[#b8c59f]">{creatorMode ? "studio mode" : "online"}</div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {workspace.messages.map((message) => (
                    <div key={message.id} className={`flex ${message.from === (creatorMode ? "studio" : "client") ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-[20px] px-4 py-3 ${message.from === (creatorMode ? "studio" : "client") ? "bg-[#3a3f36]" : "bg-[#17181f] border border-white/6"}`}>
                        <div className="text-[14px] leading-snug">{message.text}</div>
                        {message.attachment && <div className="text-[12px] text-white/70 mt-2">📎 {message.attachment}</div>}
                        <div className="text-[11px] text-white/40 mt-1.5 text-right">{message.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-white/6">
                  <div className="h-12 rounded-full bg-[#141419] border border-white/10 px-4 flex items-center gap-2">
                    <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendChatMessage()} placeholder={creatorMode ? "Pošaljite obavijest klijentu..." : "Napišite poruku..."} className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-white/35" />
                    <button onClick={sendChatMessage} className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg></button>
                  </div>
                </div>
              </motion.div>
            )}

            {view === "feedback" && (
              <motion.div key="feedback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                <div className="h-[56px] flex items-center justify-between px-4 border-b border-white/6">
                  <button onClick={() => setView(creatorMode ? "studio" : "dashboard")} className="w-8 h-8 flex items-center justify-center -ml-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg></button>
                  <div className="text-[14px] uppercase tracking-widest font-medium">Feedback</div>
                  <div className="w-8" />
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
                  <div className="rounded-[24px] bg-gradient-to-br from-[#1c221b] to-[#141419] border border-[#3a3f36]/40 p-5">
                    <div className="text-[11px] uppercase tracking-widest text-[#b8c59f]">Team review</div>
                    <div className="text-[24px] font-light mt-2" style={{ fontFamily: "serif" }}>Prikupite mišljenja zaposlenika</div>
                    <div className="text-[13px] text-white/60 mt-2 leading-relaxed">Ocijenite vizualni dojam, navigaciju, 3D iskustvo i kvalitetu rendera prije dijeljenja aplikacije klijentima.</div>
                  </div>

                  <div className="rounded-[24px] bg-[#141419] border border-white/6 p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2">
                        <span className="text-[12px] text-white/55">Ime</span>
                        <input value={feedbackForm.author} onChange={(event) => setFeedbackForm({ ...feedbackForm, author: event.target.value })} placeholder="npr. Ivana" className="w-full h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      </label>
                      <label className="space-y-2">
                        <span className="text-[12px] text-white/55">Uloga</span>
                        <input value={feedbackForm.role} onChange={(event) => setFeedbackForm({ ...feedbackForm, role: event.target.value })} placeholder="Sales / PM" className="w-full h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      </label>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[13px] mb-2"><span>Vizualni dojam</span><span className="text-white/45">{feedbackForm.design}/5</span></div>
                      <input type="range" min="1" max="5" step="1" value={feedbackForm.design} onChange={(event) => setFeedbackForm({ ...feedbackForm, design: Number(event.target.value) })} className="w-full accent-white" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[13px] mb-2"><span>Navigacija</span><span className="text-white/45">{feedbackForm.navigation}/5</span></div>
                      <input type="range" min="1" max="5" step="1" value={feedbackForm.navigation} onChange={(event) => setFeedbackForm({ ...feedbackForm, navigation: Number(event.target.value) })} className="w-full accent-white" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[13px] mb-2"><span>3D model iskustvo</span><span className="text-white/45">{feedbackForm.model}/5</span></div>
                      <input type="range" min="1" max="5" step="1" value={feedbackForm.model} onChange={(event) => setFeedbackForm({ ...feedbackForm, model: Number(event.target.value) })} className="w-full accent-white" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[13px] mb-2"><span>Kvaliteta rendera</span><span className="text-white/45">{feedbackForm.renders}/5</span></div>
                      <input type="range" min="1" max="5" step="1" value={feedbackForm.renders} onChange={(event) => setFeedbackForm({ ...feedbackForm, renders: Number(event.target.value) })} className="w-full accent-white" />
                    </div>

                    <label className="space-y-2 block">
                      <span className="text-[12px] text-white/55">Komentar</span>
                      <textarea value={feedbackForm.notes} onChange={(event) => setFeedbackForm({ ...feedbackForm, notes: event.target.value })} rows={5} placeholder="Što biste poboljšali?" className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-[14px] outline-none focus:border-white/30 resize-none" />
                    </label>

                    <div className="rounded-2xl bg-black/30 border border-white/10 px-4 py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="text-[14px]">Biste li preporučili ovu verziju?</div>
                        <div className="text-[12px] text-white/45 mt-1">Brzi signal za internu validaciju prije klijentske objave</div>
                      </div>
                      <button onClick={() => setFeedbackForm({ ...feedbackForm, recommend: !feedbackForm.recommend })} className={`w-14 h-8 rounded-full p-1 transition ${feedbackForm.recommend ? "bg-white" : "bg-white/10"}`}>
                        <div className={`w-6 h-6 rounded-full transition ${feedbackForm.recommend ? "bg-black translate-x-6" : "bg-white/70"}`} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setView(creatorMode ? "studio" : "dashboard")} className="h-12 rounded-2xl bg-white/6">Kasnije</button>
                    <button onClick={submitFeedback} className="h-12 rounded-2xl bg-white text-black font-medium">Pošalji feedback</button>
                  </div>
                </div>
              </motion.div>
            )}

            {view === "settings" && (
              <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                <div className="h-[56px] flex items-center justify-between px-4 border-b border-white/6">
                  <button onClick={() => setView("dashboard")} className="w-8 h-8 flex items-center justify-center -ml-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg></button>
                  <div className="text-[14px] uppercase tracking-widest font-medium">Postavke</div>
                  <button onClick={openCreatorStudio} className="px-3 py-1.5 rounded-full text-[11px] border border-white/15 bg-white/6">Studio</button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
                  {[
                    { label: "Supabase auth", value: isSupabaseConfigured ? "Spreman" : "Demo only" },
                    { label: "Install status", value: pwaReady ? "Available" : "Open in browser" },
                    { label: "Aktivni korisnik", value: session?.user.email ?? workspace.email },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[22px] bg-[#141419] border border-white/6 p-4 flex items-center justify-between gap-3">
                      <span className="text-[14px]">{item.label}</span>
                      <span className="text-[12px] text-white/55 text-right">{item.value}</span>
                    </div>
                  ))}

                  <button onClick={() => setShowShare(true)} className="w-full h-12 rounded-2xl bg-[#3a3f36] hover:bg-[#444a40] transition text-[14px]">Kopiraj privatni link</button>
                  <button onClick={() => setView("feedback")} className="w-full h-12 rounded-2xl bg-white/6 hover:bg-white/10 transition text-[14px]">Pošalji feedback o aplikaciji</button>
                  {pwaReady && <button onClick={installApp} className="w-full h-12 rounded-2xl bg-white text-black text-[14px] font-medium">Instaliraj aplikaciju</button>}
                  {isStandalone && <button onClick={() => setShowRemoveApp(true)} className="w-full h-12 rounded-2xl bg-red-500/10 text-red-200 border border-red-400/20 hover:bg-red-500/20 transition text-[14px]">Ukloni aplikaciju</button>}
                  <button onClick={signOut} className="w-full h-12 rounded-2xl bg-white/6 hover:bg-white/10 transition text-[14px]">Odjava</button>
                </div>
              </motion.div>
            )}

            {view === "studio" && (
              <motion.div key="studio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                <div className="h-[56px] flex items-center justify-between px-4 border-b border-white/6">
                  <button onClick={() => setView("dashboard")} className="w-8 h-8 flex items-center justify-center -ml-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg></button>
                  <div className="text-[14px] uppercase tracking-widest font-medium">Creator Studio</div>
                  <button onClick={() => setShowShare(true)} className="px-3 py-1.5 rounded-full text-[11px] border border-white/15 bg-white/6">Share</button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
                  <div className="rounded-[24px] bg-gradient-to-br from-[#1c221b] to-[#141419] border border-[#3a3f36]/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-widest text-[#b8c59f]">Publishing control</div>
                        <div className="text-[20px] mt-2 font-light" style={{ fontFamily: "serif" }}>{workspace.name}</div>
                        <div className="text-[13px] text-white/60 mt-1">Invite token: {workspace.inviteToken}</div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={duplicateWorkspace} className="px-3 py-2 rounded-full bg-white/8 text-[12px]">Dupliciraj</button>
                        <button onClick={() => setShowDeleteClient(true)} className="px-3 py-2 rounded-full bg-red-500/12 text-red-200 border border-red-400/20 text-[12px]">Remove</button>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {workspaces.map((item) => (
                        <button key={item.id} onClick={() => setSelectedWorkspaceId(item.id)} className={`rounded-2xl p-3 border text-left ${selectedWorkspaceId === item.id ? "bg-white text-black border-white" : "bg-black/25 text-white border-white/8"}`}>
                          <div className="w-8 h-8 rounded-full bg-black/20 flex items-center justify-center text-[12px] mb-2">{item.avatar}</div>
                          <div className="text-[12px] truncate">{item.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-[#141419] border border-white/6 p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[14px]">Supabase backend sync</div>
                        <div className="text-[12px] text-white/45 mt-1 leading-relaxed">{remoteStatus}</div>
                        <div className="text-[11px] text-[#b8c59f] mt-2">{lastRemoteSync ? `Zadnja sinkronizacija: ${lastRemoteSync}` : "Još nema sinkronizacije"}</div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full text-[11px] ${isSupabaseConfigured ? "bg-emerald-400/15 text-emerald-300" : "bg-white/8 text-white/50"}`}>
                        {isRemoteBusy ? "SYNC..." : isSupabaseConfigured ? "CONNECTED" : "LOCAL"}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={loadStudioFromRemote} disabled={!isSupabaseConfigured || isRemoteBusy} className="h-11 rounded-xl bg-white/8 disabled:opacity-40 text-[13px]">Load from Supabase</button>
                      <button onClick={saveCurrentWorkspaceRemote} disabled={!isSupabaseConfigured || isRemoteBusy} className="h-11 rounded-xl bg-white text-black font-medium text-[13px] disabled:opacity-40">Save workspace</button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={pushLocalSnapshotToRemote} disabled={!isSupabaseConfigured || isRemoteBusy} className="h-11 rounded-xl bg-white/8 disabled:opacity-40 text-[13px]">Push local snapshot</button>
                      <button onClick={seedRemoteDemoData} disabled={!isSupabaseConfigured || isRemoteBusy} className="h-11 rounded-xl bg-[#3a3f36] disabled:opacity-40 text-[13px]">Seed demo data</button>
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-[#141419] border border-white/6 p-4 space-y-4">
                    <div className="text-[14px]">Klijent i projekt</div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-2">
                        <span className="text-[12px] text-white/55">Klijent</span>
                        <input value={workspace.name} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, name: event.target.value }))} className="w-full h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      </label>
                      <label className="space-y-2">
                        <span className="text-[12px] text-white/55">Email</span>
                        <input value={workspace.email} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, email: event.target.value }))} className="w-full h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      </label>
                    </div>
                    <label className="space-y-2 block">
                      <span className="text-[12px] text-white/55">Projekt</span>
                      <input value={workspace.project.title} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, project: { ...current.project, title: event.target.value } }))} className="w-full h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                    </label>
                    <label className="space-y-2 block">
                      <span className="text-[12px] text-white/55">Opis</span>
                      <textarea value={workspace.project.subtitle} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, project: { ...current.project, subtitle: event.target.value } }))} rows={3} className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-[14px] outline-none focus:border-white/30 resize-none" />
                    </label>
                    <div>
                      <div className="flex items-center justify-between text-[12px] text-white/55 mb-2"><span>Napredak</span><span>{workspace.project.progress}%</span></div>
                      <input type="range" min="0" max="100" value={workspace.project.progress} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, project: { ...current.project, progress: Number(event.target.value) } }))} className="w-full accent-white" />
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-[#141419] border border-white/6 p-4 space-y-4">
                    <div className="text-[14px]">Vidljivi moduli</div>
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          ["model", "3D Model"],
                          ["renders", "Renderi"],
                          ["documents", "Dokumenti"],
                          ["chat", "Chat"],
                          ["offer", "Ponuda"],
                          ["portfolio", "Portfolio"],
                        ] as Array<[ModuleKey, string]>
                      ).map(([key, label]) => (
                        <label key={key} className="rounded-2xl bg-black/30 border border-white/8 px-4 py-3 flex items-center justify-between gap-3">
                          <span className="text-[13px]">{label}</span>
                          <input type="checkbox" checked={workspace.modules[key]} onChange={(event) => toggleModule(key, event.target.checked)} className="w-4 h-4 accent-white" />
                        </label>
                      ))}
                    </div>
                    <label className="space-y-2 block">
                      <span className="text-[12px] text-white/55">Personalizacijska napomena</span>
                      <textarea value={workspace.customNote} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, customNote: event.target.value }))} rows={4} className="w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-[14px] outline-none focus:border-white/30 resize-none" />
                    </label>
                  </div>

                  <div className="rounded-[24px] bg-[#141419] border border-white/6 p-4 space-y-4">
                    <div className="text-[14px]">Ponuda i 3D konfiguracija</div>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={workspace.offer.title} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, offer: { ...current.offer, title: event.target.value } }))} placeholder="Naziv ponude" className="h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      <input value={workspace.offer.price} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, offer: { ...current.offer, price: event.target.value } }))} placeholder="Cijena" className="h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                    </div>
                    <input value={workspace.offer.summary} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, offer: { ...current.offer, summary: event.target.value } }))} placeholder="Kratki sažetak ponude" className="w-full h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                    <div className="flex gap-2">
                      <input value={studioForm.featureText} onChange={(event) => setStudioForm((current) => ({ ...current, featureText: event.target.value }))} placeholder="Dodaj feature ponude" className="flex-1 h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      <button onClick={addOfferFeature} className="px-4 rounded-xl bg-white text-black text-[13px] font-medium">Dodaj</button>
                    </div>
                    <div className="space-y-2">
                      {workspace.offer.features.map((feature, index) => (
                        <div key={`${feature}-${index}`} className="rounded-xl bg-black/30 border border-white/8 px-4 py-2.5 flex items-center justify-between gap-3">
                          <span className="text-[13px] text-white/75">{feature}</span>
                          <button onClick={() => mutateWorkspace(workspace.id, (current) => ({ ...current, offer: { ...current.offer, features: current.offer.features.filter((item) => item !== feature || current.offer.features.indexOf(item) !== index) } }))} className="text-[12px] text-white/40">Ukloni</button>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={workspace.model.floorLabel} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, model: { ...current.model, floorLabel: event.target.value } }))} placeholder="Label kata" className="h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      <select value={workspace.model.mode} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, model: { ...current.model, mode: event.target.value as "exterior" | "interior" } }))} className="h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30">
                        <option value="exterior">Exterior default</option>
                        <option value="interior">Interior default</option>
                      </select>
                    </div>
                    <input value={workspace.model.glbUrl ?? ""} onChange={(event) => mutateWorkspace(workspace.id, (current) => ({ ...current, model: { ...current.model, glbUrl: event.target.value } }))} placeholder="GLB / GLTF URL (optional)" className="w-full h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                  </div>

                  <div className="rounded-[24px] bg-[#141419] border border-white/6 p-4 space-y-4">
                    <div className="text-[14px]">Upload / objava sadržaja</div>
                    <div className="rounded-2xl bg-black/30 border border-white/8 p-3 space-y-3">
                      <div className="text-[12px] text-white/55">Supabase Storage upload</div>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input type="file" accept="image/*" onChange={(event) => setPendingFiles((current) => ({ ...current, render: event.target.files?.[0] ?? null }))} className="h-11 rounded-xl bg-black/30 border border-white/10 px-3 text-[12px] file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1 file:text-[12px] file:text-black" />
                        <button onClick={() => uploadSelectedAsset("render")} disabled={!pendingFiles.render || isRemoteBusy} className="px-4 rounded-xl bg-white/8 text-[13px] disabled:opacity-40">Upload render</button>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input type="file" onChange={(event) => setPendingFiles((current) => ({ ...current, document: event.target.files?.[0] ?? null }))} className="h-11 rounded-xl bg-black/30 border border-white/10 px-3 text-[12px] file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1 file:text-[12px] file:text-black" />
                        <button onClick={() => uploadSelectedAsset("document")} disabled={!pendingFiles.document || isRemoteBusy} className="px-4 rounded-xl bg-white/8 text-[13px] disabled:opacity-40">Upload doc</button>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(event) => setPendingFiles((current) => ({ ...current, model: event.target.files?.[0] ?? null }))} className="h-11 rounded-xl bg-black/30 border border-white/10 px-3 text-[12px] file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1 file:text-[12px] file:text-black" />
                        <button onClick={() => uploadSelectedAsset("model")} disabled={!pendingFiles.model || isRemoteBusy} className="px-4 rounded-xl bg-white/8 text-[13px] disabled:opacity-40">Upload GLB</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_120px] gap-3">
                      <input value={studioForm.renderTitle} onChange={(event) => setStudioForm((current) => ({ ...current, renderTitle: event.target.value }))} placeholder="Naziv rendera" className="h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      <select value={studioForm.renderCategory} onChange={(event) => setStudioForm((current) => ({ ...current, renderCategory: event.target.value as RenderCategory }))} className="h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30">
                        <option value="eksterijer">Eksterijer</option>
                        <option value="interijer">Interijer</option>
                        <option value="detalji">Detalji</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input value={studioForm.renderUrl} onChange={(event) => setStudioForm((current) => ({ ...current, renderUrl: event.target.value }))} placeholder="https://...jpg ili storage URL" className="flex-1 h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      <button onClick={addRender} className="px-4 rounded-xl bg-white text-black text-[13px] font-medium">Objavi</button>
                    </div>
                    <div className="grid grid-cols-[1fr_100px_90px_auto] gap-2">
                      <input value={studioForm.documentName} onChange={(event) => setStudioForm((current) => ({ ...current, documentName: event.target.value }))} placeholder="Naziv dokumenta" className="h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      <input value={studioForm.documentType} onChange={(event) => setStudioForm((current) => ({ ...current, documentType: event.target.value }))} placeholder="Tip" className="h-11 rounded-xl bg-black/30 border border-white/10 px-3 text-[14px] outline-none focus:border-white/30" />
                      <input value={studioForm.documentSize} onChange={(event) => setStudioForm((current) => ({ ...current, documentSize: event.target.value }))} placeholder="Size" className="h-11 rounded-xl bg-black/30 border border-white/10 px-3 text-[14px] outline-none focus:border-white/30" />
                      <button onClick={addDocument} className="px-4 rounded-xl bg-white/8 text-[13px]">Dodaj</button>
                    </div>
                    <div className="flex gap-2">
                      <input value={studioForm.publishMessage} onChange={(event) => setStudioForm((current) => ({ ...current, publishMessage: event.target.value }))} placeholder="Pošalji novu obavijest klijentu" className="flex-1 h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      <button onClick={addStudioAnnouncement} className="px-4 rounded-xl bg-white/8 text-[13px]">Pošalji</button>
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-[#141419] border border-white/6 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[14px]">Feedback analytics</div>
                        <div className="text-[12px] text-white/45 mt-1">Interni komentari i preporuke zaposlenika</div>
                      </div>
                      <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(workspaceFeedback, null, 2))} className="px-3 py-1.5 rounded-full bg-white/6 text-[12px]">Kopiraj report</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl bg-black/30 border border-white/8 p-3"><div className="text-[11px] text-white/40">Unosa</div><div className="text-[22px] mt-1">{workspaceFeedback.length}</div></div>
                      <div className="rounded-2xl bg-black/30 border border-white/8 p-3"><div className="text-[11px] text-white/40">Prosjek</div><div className="text-[22px] mt-1">{feedbackAverage ? feedbackAverage.toFixed(1) : "—"}</div></div>
                      <div className="rounded-2xl bg-black/30 border border-white/8 p-3"><div className="text-[11px] text-white/40">Preporuka</div><div className="text-[22px] mt-1">{workspaceFeedback.length ? `${recommendationRate}%` : "—"}</div></div>
                    </div>
                    <div className="space-y-3">
                      <RatingRow label="Design" value={workspaceFeedback.length ? workspaceFeedback.reduce((sum, entry) => sum + entry.ratings.design, 0) / workspaceFeedback.length : 0} />
                      <RatingRow label="Navigation" value={workspaceFeedback.length ? workspaceFeedback.reduce((sum, entry) => sum + entry.ratings.navigation, 0) / workspaceFeedback.length : 0} />
                      <RatingRow label="3D model" value={workspaceFeedback.length ? workspaceFeedback.reduce((sum, entry) => sum + entry.ratings.model, 0) / workspaceFeedback.length : 0} />
                      <RatingRow label="Renders" value={workspaceFeedback.length ? workspaceFeedback.reduce((sum, entry) => sum + entry.ratings.renders, 0) / workspaceFeedback.length : 0} />
                    </div>
                    <div className="space-y-3">
                      {workspaceFeedback.slice(0, 3).map((entry) => (
                        <div key={entry.id} className="rounded-2xl bg-black/30 border border-white/8 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[13px]">{entry.author}</div>
                              <div className="text-[11px] text-white/40">{entry.role} • {entry.submittedAt}</div>
                            </div>
                            <div className="text-[12px] text-[#b8c59f]">{entry.recommend ? "Recommend" : "Needs work"}</div>
                          </div>
                          <div className="text-[12px] text-white/63 leading-relaxed mt-2">{entry.notes || "Bez dodatnog komentara."}</div>
                        </div>
                      ))}
                      {!workspaceFeedback.length && <div className="text-[12px] text-white/40">Još nema poslanih recenzija za ovog klijenta.</div>}
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-[#141419] border border-white/6 p-4 space-y-4">
                    <div className="text-[14px]">Create new client</div>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={studioForm.newClientName} onChange={(event) => setStudioForm((current) => ({ ...current, newClientName: event.target.value }))} placeholder="Ime klijenta" className="h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                      <input value={studioForm.newClientEmail} onChange={(event) => setStudioForm((current) => ({ ...current, newClientEmail: event.target.value }))} placeholder="Email klijenta" className="h-11 rounded-xl bg-black/30 border border-white/10 px-4 text-[14px] outline-none focus:border-white/30" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={createWorkspace} className="h-11 rounded-xl bg-white text-black text-[13px] font-medium">Novi klijent</button>
                      <button onClick={publishCurrentProjectToPortfolio} className="h-11 rounded-xl bg-white/8 text-[13px]">Objavi u portfolio</button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {view !== "landing" && (
            <div className="h-[82px] border-t border-white/6 bg-[#0b0b0f]/92 backdrop-blur-2xl px-2 pb-4">
              <div className="flex items-center justify-around h-full pt-1">
                {navItems.map((item) => {
                  const active = view === item.id;
                  return (
                    <button
                      key={item.label}
                      onClick={() => item.enabled && setView(item.id)}
                      className={`relative flex flex-col items-center justify-center gap-1.5 w-[72px] pt-2 ${active ? "text-white" : item.enabled ? "text-white/40" : "text-white/20"}`}
                      disabled={!item.enabled}
                    >
                      <div className="relative">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.8 : 1.5}><path d={item.icon} strokeLinecap="round" strokeLinejoin="round" /></svg>
                        {!!item.badge && item.enabled && <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#3a3f36] flex items-center justify-center text-[9px] text-white">{item.badge > 9 ? "9+" : item.badge}</div>}
                      </div>
                      <span className="text-[10.5px] tracking-wide">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <AnimatePresence>
            {showShare && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-end">
                <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="w-full bg-[#141419] rounded-t-[32px] border-t border-white/10 p-6 pb-10">
                  <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-6" />
                  <h3 className="text-[20px] font-light mb-1" style={{ fontFamily: "serif" }}>Podijeli aplikaciju</h3>
                  <p className="text-[14px] text-white/60 mb-5">Personalizirani pristup za {workspace.name}</p>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 mb-3">
                    <div className="text-[12px] text-white/45 mb-1">Install / invite link</div>
                    <div className="text-[13px] font-mono break-all">{inviteLink}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="text-[12px] text-white/45 mb-1">Invite token</div>
                    <div className="text-[15px] tracking-[0.2em]">{workspace.inviteToken}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button onClick={() => setShowShare(false)} className="h-12 rounded-2xl bg-white/6">Zatvori</button>
                    <button onClick={() => { navigator.clipboard?.writeText(inviteLink); setShowShare(false); }} className="h-12 rounded-2xl bg-white text-black font-medium">Kopiraj link</button>
                  </div>
                  <div className="mt-5 text-[12px] text-white/40 leading-relaxed">Klijent vidi samo module koje ste uključili u Creator Studio. Kada dodate Supabase ključeve, isti UX je spreman za stvarni magic-link pristup.</div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showDeleteClient && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-black/82 backdrop-blur-xl flex items-end">
                <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="w-full bg-[#141419] rounded-t-[32px] border-t border-red-400/20 p-6 pb-10">
                  <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-6" />
                  <div className="text-[11px] uppercase tracking-widest text-red-200">Danger zone</div>
                  <h3 className="text-[22px] font-light mt-2" style={{ fontFamily: "serif" }}>Remove client?</h3>
                  <p className="text-[14px] text-white/62 mt-3 leading-relaxed">
                    This will remove <span className="text-white">{workspace.name}</span> from the studio. If Supabase is configured, the workspace is deleted from the database and its messages and feedback are removed by cascade.
                  </p>
                  <div className="mt-4 rounded-2xl bg-red-500/10 border border-red-400/20 p-4 text-[12px] text-red-100/75 leading-relaxed">
                    Uploaded files in Storage are not automatically deleted, so you can keep source assets or remove them manually from Supabase Storage.
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-5">
                    <button onClick={() => setShowDeleteClient(false)} className="h-12 rounded-2xl bg-white/6">Cancel</button>
                    <button onClick={removeCurrentWorkspace} disabled={isRemoteBusy || workspaces.length <= 1} className="h-12 rounded-2xl bg-red-500 text-white font-medium disabled:opacity-40">
                      {isRemoteBusy ? "Removing..." : "Remove client"}
                    </button>
                  </div>
                  {workspaces.length <= 1 && <div className="mt-3 text-[12px] text-white/42">You need at least one workspace in the app.</div>}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showRemoveApp && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-black/82 backdrop-blur-xl flex items-end">
                <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="w-full bg-[#141419] rounded-t-[32px] border-t border-white/10 p-6 pb-10">
                  <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-6" />
                  <div className="text-[11px] uppercase tracking-widest text-[#b8c59f]">Ukloni aplikaciju</div>
                  <h3 className="text-[22px] font-light mt-2" style={{ fontFamily: "serif" }}>Želite li ukloniti aplikaciju?</h3>
                  <p className="text-[14px] text-white/62 mt-3 leading-relaxed">
                    Ovo će obrisati spremljeni pristup projektu s ovog uređaja. Aplikacija će se vratiti na početni zaslon.
                  </p>
                  <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 p-4 text-[12px] text-white/75 leading-relaxed">
                    <strong>Napomena:</strong> Da biste uklonili ikonu s početnog zaslona, dugo pritisnite ikonu aplikacije i odaberite "Ukloni aplikaciju" ili "Deinstaliraj".
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-5">
                    <button onClick={() => setShowRemoveApp(false)} className="h-12 rounded-2xl bg-white/6">Odustani</button>
                    <button
                      onClick={() => {
                        localStorage.removeItem("arstudio.pwa-invite-token");
                        setShowRemoveApp(false);
                        setView("landing");
                        setAuthNotice("Aplikacija je resetirana. Dugo pritisnite ikonu za uklanjanje.");
                      }}
                      className="h-12 rounded-2xl bg-red-500 text-white font-medium"
                    >
                      Resetiraj pristup
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="hidden lg:flex max-w-[420px] flex-col gap-5 text-white/72">
          <div className="text-[12px] uppercase tracking-[0.35em] text-[#b8c59f]">AR Studio platform</div>
          <h2 className="text-[34px] leading-tight text-white font-light" style={{ fontFamily: "serif" }}>Client-ready portal with install support, private access, studio control, and portfolio mode.</h2>
          <p className="text-[15px] leading-relaxed text-white/68">This version is designed as a realistic next step from demo to product: private client links, optional Supabase magic-link auth, persistent personalized workspaces, feedback capture, creator-side publishing controls, and a mobile-first presentation.</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <div className="text-[11px] uppercase tracking-widest text-white/40">Backend</div>
              <div className="text-[18px] mt-2 text-white">{isSupabaseConfigured ? "Supabase configured" : "Demo fallback active"}</div>
              <div className="text-[13px] text-white/55 mt-2">Magic links are ready when env keys are provided.</div>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <div className="text-[11px] uppercase tracking-widest text-white/40">Installability</div>
              <div className="text-[18px] mt-2 text-white">PWA shell enabled</div>
              <div className="text-[13px] text-white/55 mt-2">Manifest + service worker are included for add-to-home-screen flow.</div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-white/4 p-5">
            <div className="text-[12px] uppercase tracking-widest text-white/40">What works now</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] text-white/72">
              {[
                "Private invite links",
                "Persistent client customization",
                "3D preview experience",
                "Render gallery",
                "Document vault UI",
                "In-app client chat",
                "Creator Studio controls",
                "Feedback collection",
                "Portfolio mode",
                "Optional Supabase auth",
              ].map((item) => (
                <div key={item} className="rounded-full bg-black/25 px-3 py-2">{item}</div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {workspaces.map((item) => (
              <button key={item.id} onClick={() => openWorkspace(item.id)} className={`px-3 py-2 rounded-full border text-[12px] transition ${selectedWorkspaceId === item.id ? "bg-white text-black border-white" : "border-white/20 hover:border-white/40"}`}>{item.name}</button>
            ))}
            <button onClick={openCreatorStudio} className="px-3 py-2 rounded-full border border-[#b8c59f]/40 text-[#d5dfc4] text-[12px]">Creator Studio</button>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-white/4 p-5 text-[13px] leading-relaxed text-white/60">
            Next production step after this build: add real Supabase tables and storage buckets for workspaces, renders, documents, messages, and GLB assets — the app is now structured to make that transition straightforward.
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600&display=swap');
        html, body, #root { min-height: 100%; }
        html, body { background: #050507; overscroll-behavior: none; font-family: Inter, system-ui, sans-serif; }
        * { -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 0; height: 0; display: none; }
      `}</style>
    </div>
  );
}
