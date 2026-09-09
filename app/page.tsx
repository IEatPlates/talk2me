"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bell, Check, Hash, LogOut, MessageCircle, MoreHorizontal, Paperclip, Plus, Search, Send, Settings, Smile, UserPlus, Users, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Person = { name: string; handle: string; initials: string; tone: "green" | "yellow" | "coral"; online: boolean };
type Message = { id: number; sender: string; body: string; time: string; self?: boolean };
type Chat = { id: string; name: string; subtitle: string; initials: string; tone: Person["tone"]; kind: "direct" | "group"; members?: number; messages: Message[] };

const me: Person = { name: "Maya Chen", handle: "@mayac", initials: "MC", tone: "coral", online: true };
const contacts: Person[] = [
  { name: "Riley Park", handle: "@riley", initials: "RP", tone: "green", online: true },
  { name: "Noah Williams", handle: "@noahw", initials: "NW", tone: "yellow", online: true },
  { name: "Sofia Lee", handle: "@sofia", initials: "SL", tone: "green", online: false },
  { name: "Eli Morgan", handle: "@eli", initials: "EM", tone: "coral", online: false }
];

const initialChats: Chat[] = [
  { id: "riley", name: "Riley Park", subtitle: "online now", initials: "RP", tone: "green", kind: "direct", messages: [
    { id: 1, sender: "Riley Park", body: "The new flow feels so much lighter now. I think we nailed it.", time: "10:42 AM" },
    { id: 2, sender: "Maya Chen", body: "Right? I wanted it to feel like a place you actually want to return to.", time: "10:44 AM", self: true },
    { id: 3, sender: "Riley Park", body: "Mission accomplished ✨", time: "10:45 AM" }
  ] },
  { id: "studio", name: "Studio crew", subtitle: "4 members", initials: "SC", tone: "yellow", kind: "group", members: 4, messages: [
    { id: 4, sender: "Noah Williams", body: "Drop your favorite references for Friday's session here.", time: "Yesterday" },
    { id: 5, sender: "Maya Chen", body: "I have a few saved. Sending them over tonight.", time: "Yesterday", self: true }
  ] }
];

function Avatar({ person, size = "normal" }: { person: Pick<Person, "initials" | "tone">; size?: "normal" | "small" }) {
  return <div className={`avatar ${person.tone} ${size === "small" ? "small" : ""}`}>{person.initials}</div>;
}

export default function Home() {
  const [session, setSession] = useState<{ id: string; name: string; email: string } | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [chats, setChats] = useState(initialChats);
  const [activeChatId, setActiveChatId] = useState("riley");
  const [draft, setDraft] = useState("");
  const [activeNav, setActiveNav] = useState("Messages");
  const [friendRequest, setFriendRequest] = useState(true);
  const [groupOpen, setGroupOpen] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>(["riley"]);
  const [unread, setUnread] = useState(2);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setSession({ id: data.session.user.id, name: data.session.user.user_metadata?.display_name || data.session.user.email?.split("@")[0] || "You", email: data.session.user.email || "" });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.user) setSession({ id: nextSession.user.id, name: nextSession.user.user_metadata?.display_name || nextSession.user.email?.split("@")[0] || "You", email: nextSession.user.email || "" });
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.id) return;
    const client = supabase;
    const channel = client.channel(`notifications:${session.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.id}` }, payload => {
      const notification = payload.new as { conversation_id?: string };
      if (notification.conversation_id !== activeChatId && typeof Notification !== "undefined") {
        if (Notification.permission === "default") Notification.requestPermission();
        if (Notification.permission === "granted") new Notification("New message on talk2me", { body: "Someone sent a message in one of your conversations." });
      }
      setUnread(current => current + 1);
    }).subscribe();
    return () => { client.removeChannel(channel); };
  }, [activeChatId, session?.id]);

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    if (!authEmail || !authPassword || (authMode === "signup" && !authName)) return setAuthError("Fill in all fields to continue.");
    if (supabase) {
      const result = authMode === "login"
        ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        : await supabase.auth.signUp({ email: authEmail, password: authPassword, options: { data: { display_name: authName, username: authEmail.split("@")[0] } } });
      if (result.error) return setAuthError(result.error.message);
      setSession({ id: result.data.user?.id || "demo-user", name: authName || authEmail.split("@")[0], email: authEmail });
    } else {
      setSession({ id: "demo-user", name: authName || authEmail.split("@")[0], email: authEmail });
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setChats(current => current.map(chat => chat.id === activeChatId ? { ...chat, messages: [...chat.messages, { id: Date.now(), sender: "Maya Chen", body, time: "now", self: true }] } : chat));
    setDraft("");
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
  }

  function createGroup(event: FormEvent) {
    event.preventDefault();
    if (!selectedFriends.length) return;
    const newChat: Chat = { id: `group-${Date.now()}`, name: "New circle", subtitle: `${selectedFriends.length + 1} members`, initials: "NC", tone: "green", kind: "group", members: selectedFriends.length + 1, messages: [] };
    setChats(current => [...current, newChat]);
    setActiveChatId(newChat.id);
    setGroupOpen(false);
  }

  const activeChat = chats.find(chat => chat.id === activeChatId) || chats[0];
  const currentUser: Person = { ...me, name: session?.name || me.name };

  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} name={authName} setName={setAuthName} error={authError} onSubmit={handleAuth} />;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">t</span>talk2me</div>
      <div className="profile"><Avatar person={currentUser} /><div><strong>{currentUser.name}</strong><span>{currentUser.handle}</span></div><button className="icon-btn" style={{ marginLeft: "auto", border: 0 }} title="Settings"><Settings size={15} /></button></div>
      <div className="nav-label">Workspace</div>
      <nav className="nav">
        <button className={`nav-item ${activeNav === "Messages" ? "active" : ""}`} onClick={() => setActiveNav("Messages")}><MessageCircle size={16} /> Messages <span className="count">{unread}</span></button>
        <button className={`nav-item ${activeNav === "Friends" ? "active" : ""}`} onClick={() => setActiveNav("Friends")}><Users size={16} /> Friends {friendRequest && <span className="count">1</span>}</button>
        <button className={`nav-item ${activeNav === "Notifications" ? "active" : ""}`} onClick={() => { setActiveNav("Notifications"); setUnread(0); }}><Bell size={16} /> Notifications</button>
      </nav>
      <div style={{ marginTop: 30 }} className="nav-label">Your chats</div>
      <nav className="nav">{chats.map(chat => <button key={chat.id} className={`nav-item ${activeChatId === chat.id ? "active" : ""}`} onClick={() => { setActiveChatId(chat.id); setActiveNav("Messages"); }}><Hash size={15} /> {chat.name}</button>)}</nav>
      <button className="nav-item" style={{ marginTop: 7 }} onClick={() => setGroupOpen(true)}><Plus size={16} /> New group</button>
      <div className="sidebar-footer">{isSupabaseConfigured ? "CONNECTED TO SUPABASE" : "DEMO MODE · ADD SUPABASE KEYS"}<br />v1.0 · made for real conversations</div>
    </aside>

    <section className="chat-main">
      {activeNav === "Messages" ? <>
        <header className="chat-header"><div className="header-person"><Avatar person={activeChat} /><div><h1>{activeChat.name}</h1><p>{activeChat.kind === "group" ? `${activeChat.members} members` : activeChat.subtitle}</p></div></div><div className="header-actions"><button className="icon-btn" title="Search"><Search size={15} /></button><button className="icon-btn" title="More options"><MoreHorizontal size={16} /></button></div></header>
        <div className="messages"><div className="date-label">Today, October 24</div>{activeChat.messages.length ? activeChat.messages.map(message => <div className={`message-row ${message.self ? "self" : ""}`} key={message.id}>{!message.self && <Avatar person={activeChat} size="small" />}<div className="message-content"><div className="bubble">{message.body}</div><div className="message-meta">{message.self ? "You" : message.sender} · {message.time}</div></div></div>) : <div className="empty-panel"><div><MessageCircle size={25} color="#65c5a2" /><h2>Start the conversation</h2><p>This is a fresh space for your circle. Say something good.</p></div></div>}</div>
        <div className="composer-wrap"><form className="composer" onSubmit={sendMessage}><button type="button" className="icon-btn" style={{ border: 0, width: 28 }} title="Attach a file"><Paperclip size={16} /></button><textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder={`Message ${activeChat.name}`} rows={1} /><button type="button" className="icon-btn" style={{ border: 0, width: 28 }} title="Add emoji"><Smile size={16} /></button><button className="send-btn" type="submit" title="Send message"><Send size={15} /></button></form></div>
      </> : <div className="empty-panel"><div>{activeNav === "Friends" ? <Users size={28} color="#65c5a2" /> : <Bell size={28} color="#65c5a2" />}<h2>{activeNav}</h2><p>{activeNav === "Friends" ? "Your people live here. Accept requests and keep your circles close." : "You are all caught up. New message alerts will appear here."}</p></div></div>}
    </section>

    <aside className="rail"><div className="rail-section"><div className="rail-heading"><h2>People online</h2><span>{contacts.filter(person => person.online).length} active</span></div>{contacts.filter(person => person.online).map(person => <div className="person" key={person.handle}><Avatar person={person} size="small" /><div><strong>{person.name}</strong><span>{person.handle}</span></div><i className="presence" /></div>)}</div><div className="rail-section"><div className="rail-heading"><h2>Friend requests</h2><span>{friendRequest ? "1 new" : "clear"}</span></div>{friendRequest ? <div className="request"><div className="person"><Avatar person={{ initials: "JD", tone: "yellow" }} size="small" /><div><strong>Jordan Diaz</strong><span>@jordand</span></div></div><button className="accept-btn" onClick={() => setFriendRequest(false)}><Check size={12} /> Accept</button></div> : <p style={{ color: "#9aa7a0", fontSize: 11 }}>No new requests.</p>}</div><div><div className="rail-heading"><h2>Quick note</h2><span><Bell size={12} /></span></div><p style={{ color: "#89968f", fontSize: 11, lineHeight: 1.7, margin: 0 }}>You’ll get a browser notification for new messages when this chat isn’t open.</p></div></aside>
    {groupOpen && <div className="modal-backdrop"><form className="modal" onSubmit={createGroup}><button type="button" className="icon-btn close" onClick={() => setGroupOpen(false)}><X size={16} /></button><span className="kicker">New space</span><h2>Create a group chat</h2><p>Choose the friends you want in this conversation.</p>{contacts.map(person => <label className="friend-check" key={person.handle}><input type="checkbox" checked={selectedFriends.includes(person.handle)} onChange={() => setSelectedFriends(current => current.includes(person.handle) ? current.filter(item => item !== person.handle) : [...current, person.handle])} /><Avatar person={person} size="small" /><span>{person.name}</span><small>{person.handle}</small></label>)}<button className="primary-btn full" type="submit">Create group</button></form></div>}
  </main>;
}

function AuthScreen({ mode, setMode, email, setEmail, password, setPassword, name, setName, error, onSubmit }: { mode: "login" | "signup"; setMode: (mode: "login" | "signup") => void; email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void; name: string; setName: (value: string) => void; error: string; onSubmit: (event: FormEvent) => void }) {
  return <main className="auth-page"><section className="auth-art"><div className="brand"><span className="brand-mark">t</span>talk2me</div><div className="art-copy"><span className="kicker">A quieter kind of social</span><h1>Good talks, with good people.</h1><p>Talk2me keeps your conversations close, your circles intentional, and your attention where it belongs.</p></div><div className="art-note"><i /> private by default · built for your people</div></section><section className="auth-panel"><form className="auth-form" onSubmit={onSubmit}><span className="kicker">Welcome back</span><h2>{mode === "login" ? "Come on in." : "Make some room."}</h2><p>{mode === "login" ? "Log in to pick up where you left off." : "Create your account and invite your people."}</p>{mode === "signup" && <div className="field"><label htmlFor="name">Display name</label><input id="name" value={name} onChange={event => setName(event.target.value)} placeholder="How friends know you" /></div>}<div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></div><div className="field"><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 6 characters" /></div>{error && <p style={{ color: "#b05043", fontSize: 12, margin: "-5px 0 13px" }}>{error}</p>}<button className="primary-btn full" type="submit">{mode === "login" ? "Log in" : "Create account"}</button><div className="auth-switch">{mode === "login" ? "New here? " : "Already have an account? "}<button type="button" className="text-btn" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create an account" : "Log in"}</button></div>{!isSupabaseConfigured && <div className="demo-note">DEMO MODE · connect Supabase with .env.local to persist accounts, friends, messages, and notifications.</div>}</form></section></main>;
}
