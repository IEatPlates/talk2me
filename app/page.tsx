"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bell, Check, Hash, LogOut, MessageCircle, MoreHorizontal, Paperclip, Plus, Search, Send, Settings, Smile, UserPlus, Users, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Person = { id: string; name: string; handle: string; initials: string; tone: "green" | "yellow" | "coral"; online: boolean };
type Message = { id: number; sender: string; body: string; time: string; self?: boolean };
type Chat = { id: string; name: string; subtitle: string; initials: string; tone: Person["tone"]; kind: "direct" | "group"; members?: number; messages: Message[] };

const initialChats: Chat[] = [];

function Avatar({ person, size = "normal" }: { person: Pick<Person, "initials" | "tone">; size?: "normal" | "small" }) {
  return <div className={`avatar ${person.tone} ${size === "small" ? "small" : ""}`}>{person.initials}</div>;
}

function profileToPerson(profile: { id: string; username: string; display_name: string; avatar_color?: string | null }): Person {
  const initials = profile.display_name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || profile.username.slice(0, 2).toUpperCase();
  const tones: Person["tone"][] = ["green", "yellow", "coral"];
  const tone = tones[profile.username.length % tones.length];
  return { id: profile.id, name: profile.display_name, handle: `@${profile.username}`, initials, tone, online: false };
}

export default function Home() {
  const [session, setSession] = useState<{ id: string; name: string; username: string } | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [chats, setChats] = useState(initialChats);
  const [activeChatId, setActiveChatId] = useState("");
  const [draft, setDraft] = useState("");
  const [activeNav, setActiveNav] = useState("Messages");
  const [friends, setFriends] = useState<Person[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<{ id: string; person: Person }[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [friendSearchResults, setFriendSearchResults] = useState<Person[]>([]);
  const [friendError, setFriendError] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setSession({ id: data.session.user.id, name: data.session.user.user_metadata?.display_name || data.session.user.user_metadata?.username || "You", username: data.session.user.user_metadata?.username || "user" });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.user) setSession({ id: nextSession.user.id, name: nextSession.user.user_metadata?.display_name || nextSession.user.user_metadata?.username || "You", username: nextSession.user.user_metadata?.username || "user" });
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.id) return;
    const client = supabase;
    const userId = session.id;
    async function loadFriendships() {
      const [{ data: profiles }, { data: friendships, error }] = await Promise.all([
        client.from("profiles").select("id, username, display_name, avatar_color"),
        client.from("friendships").select("id, requester_id, addressee_id, status").or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      ]);
      if (error || !profiles) return;
      const people = new Map(profiles.map(profile => [profile.id, profileToPerson(profile)]));
      const accepted: Person[] = [];
      const incoming: { id: string; person: Person }[] = [];
      friendships?.forEach(friendship => {
        const otherId = friendship.requester_id === userId ? friendship.addressee_id : friendship.requester_id;
        const person = people.get(otherId);
        if (!person) return;
        if (friendship.status === "accepted") accepted.push(person);
        if (friendship.status === "pending" && friendship.addressee_id === userId) incoming.push({ id: friendship.id, person });
      });
      setFriends(accepted);
      setIncomingRequests(incoming);
    }
    loadFriendships();
    const friendshipChannel = client.channel(`friendships:${session.id}`).on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadFriendships()).subscribe();
    return () => { client.removeChannel(friendshipChannel); };
  }, [session?.id]);

  useEffect(() => {
    if (!supabase || !session?.id || !friendSearch.trim()) {
      setFriendSearchResults([]);
      return;
    }
    const client = supabase;
    const timer = window.setTimeout(async () => {
      const { data } = await client.from("profiles").select("id, username, display_name, avatar_color").ilike("username", `${friendSearch.trim().toLowerCase()}%`).neq("id", session.id).limit(8);
      setFriendSearchResults((data || []).map(profileToPerson));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [friendSearch, session?.id]);

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
    const username = authUsername.trim().toLowerCase();
    const authIdentifier = `${username}@playub.net`;
    if (!/^[a-z0-9_]{3,24}$/.test(username) || !authPassword) return setAuthError("Use a username with 3–24 letters, numbers, or underscores, plus a password.");
    if (supabase) {
      const result = authMode === "login"
        ? await supabase.auth.signInWithPassword({ email: authIdentifier, password: authPassword })
        : await supabase.auth.signUp({ email: authIdentifier, password: authPassword, options: { data: { display_name: username, username } } });
      if (result.error) {
        if (result.error.message.toLowerCase().includes("rate limit") || result.error.message.toLowerCase().includes("email")) {
          return setAuthError("Supabase is trying to send an email. In Supabase, disable Auth > Providers > Email > Confirm email, then wait for the email rate limit to reset and try again.");
        }
        return setAuthError(result.error.message);
      }
      setSession({ id: result.data.user?.id || "demo-user", name: username, username });
    } else {
      setSession({ id: "demo-user", name: username, username });
    }
  }

  async function sendFriendRequest(person: Person) {
    if (!supabase || !session) return setFriendError("Connect Supabase to send friend requests.");
    setFriendError("");
    const { error } = await supabase.from("friendships").insert({ requester_id: session.id, addressee_id: person.id });
    if (error) setFriendError(error.code === "23505" ? "A request already exists with this person." : error.message);
    else setFriendSearch("");
  }

  async function acceptFriendRequest(requestId: string) {
    if (!supabase) return;
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", requestId);
    if (error) setFriendError(error.message);
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

  const activeChat = chats.find(chat => chat.id === activeChatId) || { id: "empty", name: "Messages", subtitle: "Select a friend to start", initials: "--", tone: "green" as const, kind: "direct" as const, messages: [] };
  const currentUser: Person = { id: session?.id || "demo-user", name: session?.name || "You", handle: session ? `@${session.username}` : "@you", initials: session?.username.slice(0, 2).toUpperCase() || "YO", tone: "green", online: true };

  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} username={authUsername} setUsername={setAuthUsername} password={authPassword} setPassword={setAuthPassword} error={authError} onSubmit={handleAuth} />;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">t</span>talk2me</div>
      <div className="profile"><Avatar person={currentUser} /><div><strong>{currentUser.name}</strong><span>{currentUser.handle}</span></div><button className="icon-btn" style={{ marginLeft: "auto", border: 0 }} title="Settings"><Settings size={15} /></button></div>
      <div className="nav-label">Workspace</div>
      <nav className="nav">
        <button className={`nav-item ${activeNav === "Messages" ? "active" : ""}`} onClick={() => setActiveNav("Messages")}><MessageCircle size={16} /> Messages <span className="count">{unread}</span></button>
        <button className={`nav-item ${activeNav === "Friends" ? "active" : ""}`} onClick={() => setActiveNav("Friends")}><Users size={16} /> Friends {incomingRequests.length > 0 && <span className="count">{incomingRequests.length}</span>}</button>
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
      </> : activeNav === "Friends" ? <FriendsPanel friends={friends} incomingRequests={incomingRequests} search={friendSearch} setSearch={setFriendSearch} results={friendSearchResults} onRequest={sendFriendRequest} onAccept={acceptFriendRequest} error={friendError} /> : <div className="empty-panel"><div><Bell size={28} color="#007aff" /><h2>Notifications</h2><p>You are all caught up. New message alerts will appear here.</p></div></div>}
    </section>

    <aside className="rail"><div className="rail-section"><div className="rail-heading"><h2>Your friends</h2><span>{friends.length}</span></div>{friends.length ? friends.map(person => <div className="person" key={person.id}><Avatar person={person} size="small" /><div><strong>{person.name}</strong><span>{person.handle}</span></div></div>) : <p style={{ color: "#8e8e93", fontSize: 11 }}>Your accepted friends will appear here.</p>}</div><div className="rail-section"><div className="rail-heading"><h2>Friend requests</h2><span>{incomingRequests.length ? `${incomingRequests.length} new` : "clear"}</span></div>{incomingRequests.length ? incomingRequests.map(request => <div className="request" key={request.id}><div className="person"><Avatar person={request.person} size="small" /><div><strong>{request.person.name}</strong><span>{request.person.handle}</span></div></div><button className="accept-btn" onClick={() => acceptFriendRequest(request.id)}><Check size={12} /> Accept</button></div>) : <p style={{ color: "#8e8e93", fontSize: 11 }}>No new requests.</p>}</div><div><div className="rail-heading"><h2>Quick note</h2><span><Bell size={12} /></span></div><p style={{ color: "#8e8e93", fontSize: 11, lineHeight: 1.7, margin: 0 }}>Friend requests and accepted friends update here in real time.</p></div></aside>
    {groupOpen && <div className="modal-backdrop"><form className="modal" onSubmit={createGroup}><button type="button" className="icon-btn close" onClick={() => setGroupOpen(false)}><X size={16} /></button><span className="kicker">New space</span><h2>Create a group chat</h2><p>Choose the friends you want in this conversation.</p>{friends.map(person => <label className="friend-check" key={person.id}><input type="checkbox" checked={selectedFriends.includes(person.id)} onChange={() => setSelectedFriends(current => current.includes(person.id) ? current.filter(item => item !== person.id) : [...current, person.id])} /><Avatar person={person} size="small" /><span>{person.name}</span><small>{person.handle}</small></label>)}{!friends.length && <p style={{ color: "#8e8e93", fontSize: 12 }}>Add friends before creating a group.</p>}<button className="primary-btn full" type="submit" disabled={!friends.length}>Create group</button></form></div>}
  </main>;
}

function FriendsPanel({ friends, incomingRequests, search, setSearch, results, onRequest, onAccept, error }: { friends: Person[]; incomingRequests: { id: string; person: Person }[]; search: string; setSearch: (value: string) => void; results: Person[]; onRequest: (person: Person) => void; onAccept: (requestId: string) => void; error: string }) {
  return <div className="friends-panel"><div className="friends-panel-header"><div><span className="kicker">Your people</span><h2>Friends</h2><p>Find someone by username and send a request.</p></div><UserPlus size={28} color="#007aff" /></div><div className="friend-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search username" autoCapitalize="none" autoCorrect="off" /></div>{error && <p className="friend-error">{error}</p>}{search && <div className="friend-results">{results.length ? results.map(person => <div className="friend-result" key={person.id}><Avatar person={person} size="small" /><div><strong>{person.name}</strong><span>{person.handle}</span></div><button className="accept-btn" onClick={() => onRequest(person)}>Add</button></div>) : <p className="friends-empty">No users found.</p>}</div>}<div className="friends-list"><div className="friends-list-title">Accepted friends</div>{friends.length ? friends.map(person => <div className="friend-result" key={person.id}><Avatar person={person} size="small" /><div><strong>{person.name}</strong><span>{person.handle}</span></div><span className="friend-status">Friends</span></div>) : <div className="friends-empty">You have no accepted friends yet.</div>}</div>{incomingRequests.length > 0 && <div className="friends-list"><div className="friends-list-title">Incoming requests</div>{incomingRequests.map(request => <div className="friend-result" key={request.id}><Avatar person={request.person} size="small" /><div><strong>{request.person.name}</strong><span>{request.person.handle}</span></div><button className="accept-btn" onClick={() => onAccept(request.id)}>Accept</button></div>)}</div>}</div>;
}

function AuthScreen({ mode, setMode, username, setUsername, password, setPassword, error, onSubmit }: { mode: "login" | "signup"; setMode: (mode: "login" | "signup") => void; username: string; setUsername: (value: string) => void; password: string; setPassword: (value: string) => void; error: string; onSubmit: (event: FormEvent) => void }) {
  return <main className="auth-page"><section className="auth-art"><div className="brand"><span className="brand-mark">t</span>talk2me</div><div className="art-copy"><span className="kicker">A quieter kind of social</span><h1>Good talks, with good people.</h1><p>Talk2me keeps your conversations close, your circles intentional, and your attention where it belongs.</p></div><div className="art-note"><i /> private by default · built for your people</div></section><section className="auth-panel"><form className="auth-form" onSubmit={onSubmit}><span className="kicker">Welcome back</span><h2>{mode === "login" ? "Come on in." : "Make some room."}</h2><p>{mode === "login" ? "Log in to pick up where you left off." : "Create your account and invite your people."}</p><div className="field"><label htmlFor="username">Username</label><input id="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="your_username" autoCapitalize="none" autoCorrect="off" /></div><div className="field"><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 6 characters" /></div>{error && <p style={{ color: "#b05043", fontSize: 12, margin: "-5px 0 13px" }}>{error}</p>}<button className="primary-btn full" type="submit">{mode === "login" ? "Log in" : "Create account"}</button><div className="auth-switch">{mode === "login" ? "New here? " : "Already have an account? "}<button type="button" className="text-btn" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create an account" : "Log in"}</button></div>{!isSupabaseConfigured && <div className="demo-note">DEMO MODE · connect Supabase with .env.local to persist accounts, friends, messages, and notifications.</div>}</form></section></main>;
}
