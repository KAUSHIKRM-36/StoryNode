const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const mysql = require('mysql2');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log('Starting application...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', PORT);

// Parse MYSQL_URL
function parseConnectionString(url) {
    try {
        const urlObj = new URL(url);
        return {
            host: urlObj.hostname,
            user: urlObj.username,
            password: urlObj.password,
            database: urlObj.pathname.slice(1),
            port: parseInt(urlObj.port) || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelayMs: 0
        };
    } catch (err) {
        console.error('Failed to parse MYSQL_URL:', err.message);
        process.exit(1);
    }
}

const connectionConfig = parseConnectionString(process.env.MYSQL_URL);

// Create MySQL connection pool
const pool = mysql.createPool(connectionConfig);

console.log('MySQL Pool created for:', connectionConfig.host);

// Create session store
let sessionStore;
try {
    sessionStore = new MySQLStore({}, pool.promise());
    console.log('Session store initialized');
} catch (err) {
    console.error('Session store error:', err);
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    key: 'storynode_session',
    secret: process.env.SESSION_SECRET || "dev-storynode_super_secret_key_123",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database query helper
const query = (sql, values = []) => {
    return new Promise((resolve, reject) => {
        pool.query(sql, values, (err, results) => {
            if (err) {
                console.error('Query error:', err.message);
                return reject(err);
            }
            resolve(results);
        });
    });
};

// Error handler
const handleError = (err, res) => {
    console.error('Error:', err.message);
    res.status(500).send('Internal Server Error');
};

// ROUTES

// Home Page
app.get('/', (req, res) => {
    query('SELECT * FROM posts ORDER BY id DESC LIMIT 3')
        .then(posts => res.render('index', { posts }))
        .catch(err => handleError(err, res));
});

// Register GET
app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

// Register POST
app.post('/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.render('register', { error: 'Username and password required' });
    }

    query('SELECT * FROM users WHERE username = ?', [username])
        .then(results => {
            if (results.length > 0) {
                return res.render('register', { error: 'Username already exists' });
            }

            const hashedPassword = bcrypt.hashSync(password, 10);
            return query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
        })
        .then(() => res.redirect('/login'))
        .catch(err => handleError(err, res));
});

// Login GET
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Login POST
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    query('SELECT * FROM users WHERE username = ?', [username])
        .then(results => {
            if (results.length > 0 && bcrypt.compareSync(password, results[0].password)) {
                req.session.userId = results[0].id;
                req.session.username = results[0].username;
                return res.redirect('/dashboard');
            }
            res.render('login', { error: 'Invalid username or password' });
        })
        .catch(err => handleError(err, res));
});

// Dashboard
app.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const userId = req.session.userId;

    Promise.all([
        query('SELECT username FROM users WHERE id = ?', [userId]),
        query('SELECT * FROM posts'),
        query('SELECT * FROM posts WHERE user_id = ?', [userId])
    ])
        .then(([userResults, allPosts, userPosts]) => {
            if (userResults.length === 0) {
                return res.redirect('/login');
            }

            res.render('dashboard', {
                posts: userPosts,
                allPosts: allPosts,
                username: userResults[0].username
            });
        })
        .catch(err => handleError(err, res));
});

// Post Details
app.get('/post/:id', (req, res) => {
    query('SELECT * FROM posts WHERE id = ?', [req.params.id])
        .then(results => {
            if (results.length === 0) {
                return res.status(404).send('Post not found');
            }
            res.render('post', { post: results[0], userId: req.session.userId });
        })
        .catch(err => handleError(err, res));
});

// Create Post Form
app.get('/create-post', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.render('create-post');
});

// Create Post
app.post('/posts', (req, res) => {
    const { title, content, category } = req.body;
    const userId = req.session.userId;
    const writerName = req.session.username;

    if (!title || !content || !category) {
        return res.status(400).send('Title, content, and category required');
    }

    query('INSERT INTO posts (title, content, category, user_id, writer_name) VALUES (?, ?, ?, ?, ?)',
        [title, content, category, userId, writerName])
        .then(() => res.redirect('/dashboard'))
        .catch(err => handleError(err, res));
});

// Delete Post
app.get('/delete-post/:id', (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;

    query('SELECT user_id FROM posts WHERE id = ?', [postId])
        .then(results => {
            if (results.length === 0) {
                return res.status(404).send('Post not found');
            }
            if (results[0].user_id !== userId) {
                return res.status(403).send('Unauthorized');
            }

            return Promise.all([
                query('DELETE FROM comments WHERE post_id = ?', [postId]),
                query('DELETE FROM posts WHERE id = ?', [postId])
            ]);
        })
        .then(() => res.redirect('/dashboard'))
        .catch(err => handleError(err, res));
});

// Edit Post Form
app.get('/edit-post/:id', (req, res) => {
    query('SELECT * FROM posts WHERE id = ?', [req.params.id])
        .then(results => {
            if (results.length === 0) {
                return res.status(404).send('Post not found');
            }
            res.render('edit-post', { post: results[0] });
        })
        .catch(err => handleError(err, res));
});

// Update Post
app.post('/update-post/:id', (req, res) => {
    const { title, content, category } = req.body;

    query('UPDATE posts SET title = ?, content = ?, category = ? WHERE id = ?',
        [title, content, category, req.params.id])
        .then(() => res.redirect('/dashboard'))
        .catch(err => handleError(err, res));
});

// Explore Posts
app.get('/explore-posts', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    query('SELECT * FROM posts')
        .then(posts => res.render('explore', { posts }))
        .catch(err => handleError(err, res));
});

// Suggested Posts
app.get('/suggested-posts', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    query(`
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
    `, [req.session.userId, req.session.userId])
        .then(posts => res.json({ posts }))
        .catch(err => {
            console.error('Suggested posts error:', err);
            res.status(500).json({ error: 'Database error' });
        });
});

// Add Comment
app.post('/comments', (req, res) => {
    const { postId, comment } = req.body;
    const userId = req.session.userId;

    query('INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)',
        [postId, userId, comment])
        .then(() => res.redirect('/dashboard'))
        .catch(err => handleError(err, res));
});

// Search
app.get('/search', (req, res) => {
    const searchQuery = req.query.query;
    const userId = req.session.userId;

    if (!searchQuery) {
        return res.redirect('/dashboard');
    }

    Promise.all([
        query('SELECT * FROM posts WHERE title LIKE ? OR content LIKE ?',
            [`%${searchQuery}%`, `%${searchQuery}%`]),
        query('SELECT username FROM users WHERE id = ?', [userId])
    ])
        .then(([posts, userResults]) => {
            res.render('dashboard', {
                posts,
                allPosts: posts,
                username: userResults[0].username,
                query: searchQuery
            });
        })
        .catch(err => handleError(err, res));
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Delete Account
app.delete('/delete-account', (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    query('DELETE FROM users WHERE id = ?', [userId])
        .then(() => {
            req.session.destroy(() => {
                res.json({ message: 'Account deleted successfully' });
            });
        })
        .catch(err => {
            console.error('Delete account error:', err);
            res.status(500).json({ message: 'Error deleting account' });
        });
});

// Get Like Count
app.get('/post-likes/:postId', (req, res) => {
    const postId = req.params.postId;
    const userId = req.session.userId;

    query('SELECT COUNT(*) as like_count FROM likes WHERE post_id = ?', [postId])
        .then(results => {
            const likeCount = results[0].like_count;

            if (!userId) {
                return res.json({ like_count: likeCount, user_liked: false });
            }

            return query('SELECT * FROM likes WHERE post_id = ? AND user_id = ?',
                [postId, userId])
                .then(likeResults => {
                    res.json({
                        like_count: likeCount,
                        user_liked: likeResults.length > 0
                    });
                });
        })
        .catch(err => {
            console.error('Like count error:', err);
            res.status(500).json({ error: 'Database error' });
        });
});

// Toggle Like
app.post('/like/:postId', (req, res) => {
    const postId = req.params.postId;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    query('SELECT * FROM likes WHERE post_id = ? AND user_id = ?', [postId, userId])
        .then(results => {
            if (results.length > 0) {
                return query('DELETE FROM likes WHERE post_id = ? AND user_id = ?',
                    [postId, userId]);
            }
            return query('INSERT INTO likes (post_id, user_id) VALUES (?, ?)',
                [postId, userId]);
        })
        .then(() => {
            return query('SELECT COUNT(*) as like_count FROM likes WHERE post_id = ?', [postId]);
        })
        .then(results => {
            res.json({
                liked: results.length > 0,
                like_count: results[0].like_count
            });
        })
        .catch(err => {
            console.error('Like toggle error:', err);
            res.status(500).json({ error: 'Database error' });
        });
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).send('Internal Server Error');
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Server listening on port ${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV}`);
    console.log(`✓ Database: ${connectionConfig.host}:${connectionConfig.port}/${connectionConfig.database}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        pool.end(() => {
            console.log('Server and connections closed');
            process.exit(0);
        });
    });
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});