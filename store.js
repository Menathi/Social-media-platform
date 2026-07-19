const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function ensureFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], posts: [], notifications: [] }, null, 2));
  }
}

function load() {
  ensureFile();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function save(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function newId() {
  return crypto.randomUUID();
}

// ---------- users ----------

function stripPassword(user) {
  if (!user) return user;
  const { password, ...rest } = user;
  return rest;
}

function publicUser(id) {
  const db = load();
  const u = db.users.find((u) => u._id === id);
  if (!u) return { _id: id, username: 'unknown', avatar: '' };
  return { _id: u._id, username: u.username, avatar: u.avatar || '' };
}

const users = {
  findByEmailOrUsername(value) {
    const db = load();
    const v = (value || '').toLowerCase();
    return db.users.find((u) => u.email === v || u.username.toLowerCase() === v);
  },
  findByUsername(username) {
    const db = load();
    return db.users.find((u) => u.username.toLowerCase() === (username || '').toLowerCase());
  },
  findById(id) {
    const db = load();
    return db.users.find((u) => u._id === id);
  },
  searchByUsername(query, limit = 10) {
    const db = load();
    const q = (query || '').toLowerCase();
    return db.users
      .filter((u) => u.username.toLowerCase().includes(q))
      .slice(0, limit)
      .map((u) => ({ _id: u._id, username: u.username, avatar: u.avatar || '' }));
  },
  create({ username, email, password }) {
    const db = load();
    const user = {
      _id: newId(),
      username,
      email: email.toLowerCase(),
      password,
      bio: '',
      avatar: '',
      followers: [],
      following: [],
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    save(db);
    return user;
  },
  update(id, patch) {
    const db = load();
    const u = db.users.find((u) => u._id === id);
    if (!u) return null;
    Object.assign(u, patch);
    save(db);
    return u;
  },
  addFollow(meId, targetId) {
    const db = load();
    const me = db.users.find((u) => u._id === meId);
    const target = db.users.find((u) => u._id === targetId);
    if (!me || !target) return false;
    if (!me.following.includes(targetId)) me.following.push(targetId);
    if (!target.followers.includes(meId)) target.followers.push(meId);
    save(db);
    return true;
  },
  removeFollow(meId, targetId) {
    const db = load();
    const me = db.users.find((u) => u._id === meId);
    const target = db.users.find((u) => u._id === targetId);
    if (!me || !target) return false;
    me.following = me.following.filter((id) => id !== targetId);
    target.followers = target.followers.filter((id) => id !== meId);
    save(db);
    return true;
  },
};

// ---------- posts ----------

function populatePost(post) {
  return {
    ...post,
    author: publicUser(post.author),
    tags: (post.tags || []).map((id) => publicUser(id)),
    comments: (post.comments || []).map((c) => ({ ...c, author: publicUser(c.author) })),
  };
}

const posts = {
  create({ author, caption, media, mediaType, tags }) {
    const db = load();
    const post = {
      _id: newId(),
      author,
      caption: caption || '',
      media: media || '',
      mediaType: mediaType || '',
      tags: tags || [],
      likes: [],
      comments: [],
      createdAt: new Date().toISOString(),
    };
    db.posts.push(post);
    save(db);
    return populatePost(post);
  },
  findById(id) {
    const db = load();
    return db.posts.find((p) => p._id === id);
  },
  feed(limit = 50) {
    const db = load();
    return db.posts
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit)
      .map(populatePost);
  },
  byAuthor(authorId) {
    const db = load();
    return db.posts
      .filter((p) => p.author === authorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(populatePost);
  },
  byAuthors(authorIds, limit = 50) {
    const db = load();
    return db.posts
      .filter((p) => authorIds.includes(p.author))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit)
      .map(populatePost);
  },
  trending(days = 7, limit = 20) {
    const db = load();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    return db.posts
      .filter((p) => new Date(p.createdAt).getTime() >= since)
      .map((p) => ({ post: p, score: p.likes.length + p.comments.length * 2 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => populatePost(x.post));
  },
  toggleLike(postId, userId) {
    const db = load();
    const post = db.posts.find((p) => p._id === postId);
    if (!post) return null;
    const already = post.likes.includes(userId);
    if (already) {
      post.likes = post.likes.filter((id) => id !== userId);
    } else {
      post.likes.push(userId);
    }
    save(db);
    return { liked: !already, likeCount: post.likes.length, authorId: post.author };
  },
  addComment(postId, authorId, text) {
    const db = load();
    const post = db.posts.find((p) => p._id === postId);
    if (!post) return null;
    const comment = { _id: newId(), author: authorId, text, createdAt: new Date().toISOString() };
    post.comments.push(comment);
    save(db);
    return { comment: { ...comment, author: publicUser(authorId) }, authorId: post.author };
  },
  delete(postId, requesterId) {
    const db = load();
    const post = db.posts.find((p) => p._id === postId);
    if (!post) return { error: 'not_found' };
    if (post.author !== requesterId) return { error: 'forbidden' };
    db.posts = db.posts.filter((p) => p._id !== postId);
    save(db);
    return { ok: true };
  },
};

// ---------- notifications ----------

const notifications = {
  create({ recipient, sender, type, post }) {
    if (recipient === sender) return; // don't notify yourself
    const db = load();
    db.notifications.push({
      _id: newId(),
      recipient,
      sender,
      type,
      post: post || null,
      read: false,
      createdAt: new Date().toISOString(),
    });
    save(db);
  },
  forUser(userId, limit = 50) {
    const db = load();
    return db.notifications
      .filter((n) => n.recipient === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit)
      .map((n) => ({ ...n, sender: publicUser(n.sender) }));
  },
  markAllRead(userId) {
    const db = load();
    db.notifications.forEach((n) => {
      if (n.recipient === userId) n.read = true;
    });
    save(db);
  },
};

module.exports = { newId, stripPassword, publicUser, users, posts, notifications };
