export type ModuleKey = "model" | "renders" | "documents" | "chat" | "offer" | "portfolio";
export type AppView = "landing" | "dashboard" | "model" | "renders" | "docs" | "chat" | "feedback" | "settings" | "studio";

export interface Offer {
  title: string;
  price: string;
  validUntil: string;
  summary: string;
  features: string[];
}

export interface RenderItem {
  id: string;
  title: string;
  image: string;
  category: "eksterijer" | "interijer" | "detalji";
  stage: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  type: string;
  size: string;
  date: string;
  locked?: boolean;
  url?: string;
}

export interface MessageItem {
  id: string;
  from: "client" | "studio";
  text: string;
  time: string;
  attachment?: string;
}

export interface PortfolioItem {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  year: string;
}

export interface ModelConfig {
  title: string;
  floorLabel: string;
  mode: "exterior" | "interior";
  glbUrl?: string;
  notes: string[];
}

export interface ClientWorkspace {
  id: string;
  inviteToken: string;
  name: string;
  email: string;
  avatar: string;
  welcome: string;
  status: "active" | "review" | "completed";
  location?: string;
  project: {
    title: string;
    subtitle: string;
    progress: number;
    image: string;
  };
  modules: Record<ModuleKey, boolean>;
  offer: Offer;
  customNote: string;
  model: ModelConfig;
  renders: RenderItem[];
  documents: DocumentItem[];
  messages: MessageItem[];
  portfolio: PortfolioItem[];
}

export interface FeedbackEntry {
  id: string;
  workspaceId: string;
  author: string;
  role: string;
  ratings: {
    design: number;
    navigation: number;
    model: number;
    renders: number;
  };
  notes: string;
  recommend: boolean;
  submittedAt: string;
}

export interface AuthState {
  email: string;
  invitedWorkspaceId?: string;
}
