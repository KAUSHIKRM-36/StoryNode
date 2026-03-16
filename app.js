const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const mysql = require('mysql2/promise');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Log startup info
console.log('Starting app...');
console.log('Database URL:', process.env.MYSQL_URL ? 'Set' : 'MISSING!');

// Create MySQL connection pool
let pool;

async function initializeDatabase() {
    try {
        pool = mysql.createPool(process.env.MYSQL_URL);
        console.log('✓ MySQL Pool created');
        
        // Test connection
        const connection = await pool.getConnection();
        console.log('✓ Database connection successful');
        connection.release();
        
        return true;
    } catch (err) {
        console.error('✗ Database connection failed:', err.message);
        return false;
    }
}

// Create MySQL session store
const sessionStore = new MySQLStore({}, pool);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    key: 'storynode_session',
    secret: process.env.SESSION_SECRET || "dev-storynode_super_secret_key_123",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database query helper
const dbQuery = async (query, params = []) => {
    try {
        const connection = await pool.getConnection();
        const [results] = await connection.execute(query, params);
        connection.release();
        return results;
    } catch (err) {
        console.error('Database error:', err);
        throw err;
    }
};

// Error handler
const handleDatabaseError = (err, res) => {
    console.error('Database error:', err.message);
    res.status(500).send('Internal Server Error');
};

// ROUTES

// Home Page
app.get('/', async (req, res) => {
    try {
        const posts = await dbQuery('SELECT * FROM posts ORDER BY id DESC LIMIT 3');
        res.render('index', { posts });
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// User Registration
app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.render('register', { error: 'Username and password are required' });
        }
        
        const existing = await dbQuery('SELECT * FROM users WHERE username = ?', [username]);
        
        if (existing.length > 0) {
            return res.render('register', { error: 'Username already exists' });
        }
        
        const hashedPassword = bcrypt.hashSync(password, 10);
        await dbQuery('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
        
        res.redirect('/login');
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// User Login
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await dbQuery('SELECT * FROM users WHERE username = ?', [username]);
        
        if (users.length > 0 && bcrypt.compareSync(password, users[0].password)) {
            req.session.userId = users[0].id;
            req.session.username = users[0].username;
            return res.redirect('/dashboard');
        }
        
        res.render('login', { error: 'Invalid username or password' });
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// Dashboard
app.get('/dashboard', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.redirect('/login');
        }

        const users = await dbQuery('SELECT username FROM users WHERE id = ?', [req.session.userId]);
        
        if (users.length === 0) {
            req.session.destroy();
            return res.redirect('/login');
        }

        const allPosts = await dbQuery('SELECT * FROM posts');
        const posts = await dbQuery('SELECT * FROM posts WHERE user_id = ?', [req.session.userId]);
        
        res.render('dashboard', { 
            posts,
            allPosts,
            username: users[0].username 
        });
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// Post Details
app.get('/post/:id', async (req, res) => {
    try {
        const posts = await dbQuery('SELECT * FROM posts WHERE id = ?', [req.params.id]);
        
        if (posts.length === 0) {
            return res.status(404).send('Post not found');
        }
        
        res.render('post', { post: posts[0], userId: req.session.userId });
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// Create Post Form
app.get('/create-post', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    res.render('create-post');
});

// Create Post
app.post('/posts', async (req, res) => {
    try {
        const { title, content, category } = req.body;
        
        if (!title || !content || !category) {
            return res.status(400).send('All fields required');
        }
        
        await dbQuery(
            'INSERT INTO posts (title, content, category, user_id, writer_name) VALUES (?, ?, ?, ?, ?)',
            [title, content, category, req.session.userId, req.session.username]
        );
        
        res.redirect('/dashboard');
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// Delete Post
app.get('/delete-post/:id', async (req, res) => {
    try {
        const posts = await dbQuery('SELECT user_id FROM posts WHERE id = ?', [req.params.id]);
        
        if (posts.length === 0) {
            return res.status(404).send('Post not found');
        }
        
        if (posts[0].user_id !== req.session.userId) {
            return res.status(403).send('Unauthorized');
        }
        
        await dbQuery('DELETE FROM comments WHERE post_id = ?', [req.params.id]);
        await dbQuery('DELETE FROM posts WHERE id = ?', [req.params.id]);
        
        res.redirect('/dashboard');
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// Edit Post Form
app.get('/edit-post/:id', async (req, res) => {
    try {
        const posts = await dbQuery('SELECT * FROM posts WHERE id = ?', [req.params.id]);
        
        if (posts.length === 0) {
            return res.status(404).send('Post not found');
        }
        
        res.render('edit-post', { post: posts[0] });
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// Update Post
app.post('/update-post/:id', async (req, res) => {
    try {
        const { title, content, category } = req.body;
        
        await dbQuery(
            'UPDATE posts SET title = ?, content = ?, category = ? WHERE id = ?',
            [title, content, category, req.params.id]
        );
        
        res.redirect('/dashboard');
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// Explore Posts
app.get('/explore-posts', async (req, res) => {
    try {
        if (!req.session.userId) return res.redirect('/login');
        
        const posts = await dbQuery('SELECT * FROM posts');
        res.render('explore', { posts });
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// Suggested Posts
app.get('/suggested-posts', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const posts = await dbQuery(`
            SELECT DISTINCT p.* FROM posts p
            WHERE p.category IN (
                SELECT DISTINCT p2.category FROM posts p2
                INNER JOIN likes l ON l.post_id = p2.id
                WHERE l.user_id = ?
            )
            AND p.id NOT IN (
                SELECT post_id FROM likes WHERE user_id = ?
            )
            ORDER BY p.id DESC
        `, [req.session.userId, req.session.userId]);
        
        res.json({ posts });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Add Comment
app.post('/comments', async (req, res) => {
    try {
        const { postId, comment } = req.body;
        
        await dbQuery(
            'INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)',
            [postId, req.session.userId, comment]
        );
        
        res.redirect('/dashboard');
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// Search
app.get('/search', async (req, res) => {
    try {
        const query = req.query.query;
        
        if (!query) return res.redirect('/dashboard');
        
        const posts = await dbQuery('SELECT * FROM posts WHERE title LIKE ? OR content LIKE ?', 
            [`%${query}%`, `%${query}%`]);
        
        const users = await dbQuery('SELECT username FROM users WHERE id = ?', [req.session.userId]);
        
        res.render('dashboard', {
            posts,
            allPosts: posts,
            username: users[0].username,
            query
        });
    } catch (err) {
        handleDatabaseError(err, res);
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// Delete Account
app.delete('/delete-account', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        
        await dbQuery('DELETE FROM users WHERE id = ?', [req.session.userId]);
        
        req.session.destroy(() => {
            res.json({ message: 'Account deleted' });
        });
    } catch (err) {
        res.status(500).json({ message: 'Error' });
    }
});

// Get Like Count
app.get('/post-likes/:postId', async (req, res) => {
    try {
        const result = await dbQuery('SELECT COUNT(*) as like_count FROM likes WHERE post_id = ?', [req.params.postId]);
        const likeCount = result[0].like_count;
        
        if (!req.session.userId) {
            return res.json({ like_count: likeCount, user_liked: false });
        }
        
        const liked = await dbQuery('SELECT * FROM likes WHERE post_id = ? AND user_id = ?', 
            [req.params.postId, req.session.userId]);
        
        res.json({ like_count: likeCount, user_liked: liked.length > 0 });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Toggle Like
app.post('/like/:postId', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const liked = await dbQuery('SELECT * FROM likes WHERE post_id = ? AND user_id = ?',
            [req.params.postId, req.session.userId]);
        
        if (liked.length > 0) {
            await dbQuery('DELETE FROM likes WHERE post_id = ? AND user_id = ?',
                [req.params.postId, req.session.userId]);
        } else {
            await dbQuery('INSERT INTO likes (post_id, user_id) VALUES (?, ?)',
                [req.params.postId, req.session.userId]);
        }
        
        const count = await dbQuery('SELECT COUNT(*) as like_count FROM likes WHERE post_id = ?', [req.params.postId]);
        
        res.json({ 
            liked: liked.length === 0, 
            like_count: count[0].like_count 
        });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).send('Internal Server Error');
});

// Initialize and start server
async function start() {
    const dbConnected = await initializeDatabase();
    
    if (!dbConnected) {
        console.error('Cannot start server without database connection');
        process.exit(1);
    }
    
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`✓ Server running on port ${PORT}`);
    });
}

start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});