import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext.jsx";
import "./Dashboard.css";

function initials(name = "") {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Dashboard() {
  const { user, token, logout, API_URL } = useAuth();

  const [contacts, setContacts] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [typingFrom, setTypingFrom] = useState(null);

  const socketRef = useRef(null);
  const chatBoxRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const activeContactRef = useRef(null);

  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  // Connect socket once
  useEffect(() => {
    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on("receiveMessage", (message) => {
      const current = activeContactRef.current;
      if (
        current &&
        (message.sender === current._id ||
          message.sender === current.id ||
          message.receiver === current._id ||
          message.receiver === current.id)
      ) {
        setMessages((prev) => [...prev, message]);
      }
    });

    socket.on("presenceUpdate", ({ userId, online }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });

    socket.on("typing", ({ senderId }) => {
      if (activeContactRef.current?._id === senderId) {
        setTypingFrom(senderId);
      }
    });

    socket.on("stopTyping", ({ senderId }) => {
      if (activeContactRef.current?._id === senderId) {
        setTypingFrom(null);
      }
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load contact list
  useEffect(() => {
    async function loadContacts() {
      try {
        const res = await axios.get(`${API_URL}/api/users`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setContacts(res.data.users);
        const online = res.data.users.filter((u) => u.online).map((u) => u._id);
        setOnlineIds(new Set(online));
      } catch (err) {
        console.error("Failed to load contacts", err);
      }
    }
    loadContacts();
  }, [API_URL, token]);

  // Load conversation history when contact changes
  useEffect(() => {
    if (!activeContact) return;

    async function loadMessages() {
      try {
        const res = await axios.get(`${API_URL}/api/messages/${activeContact._id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMessages(res.data.messages);
      } catch (err) {
        console.error("Failed to load messages", err);
      }
    }
    loadMessages();
    setTypingFrom(null);
  }, [activeContact, API_URL, token]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages, typingFrom]);

  function handleSelectContact(contact) {
    setActiveContact(contact);
  }

  function handleTextChange(e) {
    setText(e.target.value);
    if (!activeContact) return;

    socketRef.current.emit("typing", { receiverId: activeContact._id });

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current.emit("stopTyping", { receiverId: activeContact._id });
    }, 1200);
  }

  function handleSend(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !activeContact) return;

    socketRef.current.emit("sendMessage", { receiverId: activeContact._id, text: trimmed });
    socketRef.current.emit("stopTyping", { receiverId: activeContact._id });
    setText("");
  }

  return (
    <div className="dash-page">
      <div className="dash-shell">
        {/* Sidebar */}
        <div className="dash-sidebar">
          <div className="dash-sidebar-header">
            <span className="dash-brand">ChatConnect</span>
            <button className="logout-btn" onClick={logout}>
              Logout
            </button>
          </div>

          <div className="me-card">
            <div className="avatar" style={{ background: user?.avatarColor }}>
              {initials(user?.name)}
              <span className="status-dot online"></span>
            </div>
            <div>
              <div className="me-name">{user?.name}</div>
              <div className="me-email">{user?.email}</div>
            </div>
          </div>

          <div className="contacts-label">Contacts</div>

          <div className="contacts-list">
            {contacts.length === 0 && (
              <div className="empty-contacts">No other users yet. Invite a friend to sign up!</div>
            )}

            {contacts.map((c) => (
              <div
                key={c._id}
                className={`contact-item ${activeContact?._id === c._id ? "active" : ""}`}
                onClick={() => handleSelectContact(c)}
              >
                <div className="avatar" style={{ background: c.avatarColor }}>
                  {initials(c.name)}
                  <span className={`status-dot ${onlineIds.has(c._id) ? "online" : ""}`}></span>
                </div>
                <div className="contact-info">
                  <div className="contact-name">{c.name}</div>
                  <div className="contact-sub">
                    {onlineIds.has(c._id) ? "Online" : "Offline"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat section */}
        {activeContact ? (
          <div className="chat-section">
            <div className="chat-header">
              <div className="avatar" style={{ background: activeContact.avatarColor }}>
                {initials(activeContact.name)}
              </div>
              <div>
                <div className="chat-header-name">{activeContact.name}</div>
                <div className={`chat-header-status ${onlineIds.has(activeContact._id) ? "online" : ""}`}>
                  {onlineIds.has(activeContact._id) ? "Online" : "Offline"}
                </div>
              </div>
            </div>

            <div className="chat-box" ref={chatBoxRef}>
              {messages.map((m) => (
                <div
                  key={m._id}
                  className={`msg-row ${m.sender === activeContact._id ? "theirs" : "mine"}`}
                >
                  <div className="msg-bubble">
                    {m.text}
                    <span className="msg-time">{formatTime(m.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="typing-indicator">
              {typingFrom === activeContact._id ? `${activeContact.name} is typing...` : ""}
            </div>

            <form className="input-box" onSubmit={handleSend}>
              <input
                type="text"
                placeholder={`Message ${activeContact.name}...`}
                value={text}
                onChange={handleTextChange}
              />
              <button type="submit" disabled={!text.trim()}>
                Send
              </button>
            </form>
          </div>
        ) : (
          <div className="no-chat-selected">
            <div className="big-emoji">💬</div>
            <p>Select a contact to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
