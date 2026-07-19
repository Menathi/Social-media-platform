const express = require('express');
const store = require('../lib/store');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Create a post (with optional image/video and tagged usernames)
router.post('/', requireAuth, upload.single('media'), (req, res) => {
  try {
    const { caption, tags } = req.body; // tags: comma-separated usernames
    let taggedIds = [];

    if (tags) {
      const usernames = tags.split(',').map((t) => t.trim()).filter(Boolean);
      taggedIds = usernames
        .map((name) => store.users.findByUsername(name))
        .filter(Boolean)
        .map((u) => u._id);
    }

    const post = store.posts.create({
      author: req.session.userId,
      caption: caption || '',
      media: req.file ? '/uploads/' + req.file.filename : '',
      mediaType: req.file ? (req.file.mimetype.startsWith('video') ? 'video' : 'image') : '',
      tags: taggedIds,
    });

    taggedIds
      .filter((id) => id !== req.session.userId)
      .forEach((id) =>
        store.notifications.create({ recipient: id, sender: req.session.userId, type: 'tag', post: post._id })
      );

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: 'Could not create post.', details: err.message });
  }
});

// Global feed (all posts, newest first)
router.get('/feed', (req, res) => {
  res.json(store.posts.feed(50));
});

// Following-only feed
router.get('/following', requireAuth, (req, res) => {
  const me = store.users.findById(req.session.userId);
  res.json(store.posts.byAuthors(me.following, 50));
});

// Trending: most liked/commented in the last 7 days
router.get('/trending', (req, res) => {
  res.json(store.posts.trending(7, 20));
});

// Like / unlike a post (toggle)
router.post('/:id/like', requireAuth, (req, res) => {
  const result = store.posts.toggleLike(req.params.id, req.session.userId);
  if (!result) return res.status(404).json({ error: 'Post not found.' });

  if (result.liked) {
    store.notifications.create({
      recipient: result.authorId,
      sender: req.session.userId,
      type: 'like',
      post: req.params.id,
    });
  }
  res.json({ liked: result.liked, likeCount: result.likeCount });
});

// Comment on a post
router.post('/:id/comment', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Comment text is required.' });

  const result = store.posts.addComment(req.params.id, req.session.userId, text.trim());
  if (!result) return res.status(404).json({ error: 'Post not found.' });

  store.notifications.create({
    recipient: result.authorId,
    sender: req.session.userId,
    type: 'comment',
    post: req.params.id,
  });

  res.status(201).json(result.comment);
});

// Delete own post
router.delete('/:id', requireAuth, (req, res) => {
  const result = store.posts.delete(req.params.id, req.session.userId);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Post not found.' });
  if (result.error === 'forbidden') return res.status(403).json({ error: 'You can only delete your own posts.' });
  res.json({ message: 'Post deleted.' });
});

module.exports = router;
