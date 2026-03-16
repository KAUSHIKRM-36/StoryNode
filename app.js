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
            enableKeepAlive: true
        };
    } catch (err) {
        console.error('Failed to parse MYSQL_URL:', err.message);
        process.exit(1);
    }
}

const connectionConfig = parseConnectionString(process.env.MYSQL_URL);
const pool = mysql.createPool(connectionConfig);

console.log('MySQL Pool created for:', connectionConfig.host);

// Test connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection FAILED:', err.message);
    } else {
        console.log('✓ Database connection successful');
        connection.release();
    }
});

// Create session store
let sessionStore;
try {
    sessionStore = new MySQLStore({}, pool.promise());
    console.log('✓ Session store initialized');
} catch (err) {
    console.error('⚠️ Session store error:', err.message);
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
                console.error('[DB ERROR]', err.code, '-', err.message);
                return reject(err);
            }
            resolve(results);
        });
    });
};

// Error handler
const handleError = (err, res, context = '') => {
    console.error(`[ERROR - ${context}]`, err.message);
    console.error(err.stack);
    res.status(500).send(`Internal Server Error: ${context}`);
};

// ROUTES

// Health check - no rendering
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Home Page
app.get('/', (req, res) => {
    console.log('[GET /]');
    query('SELECT * FROM posts ORDER BY id DESC LIMIT 3')
        .then(posts => {
            console.log('[RENDER] index');
            res.render('index', { posts }, (err, html) => {
                if (err) {
                    console.error('[RENDER ERROR - index]', err.message);
                    return res.status(500).send('Error rendering index: ' + err.message);
                }
                res.send(html);
            });
        })
        .catch(err => handleError(err, res, 'GET /'));
});

// Register GET
app.get('/register', (req, res) => {
    console.log('[GET /register]');
    res.render('register', { error: null }, (err, html) => {
        if (err) {
            console.error('[RENDER ERROR - register]', err.message);
            return res.status(500).send('Error rendering register: ' + err.message);
        }
        res.send(html);
    });
});

// Register POST
app.post('/register', (req, res) => {
    console.log('[POST /register]', req.body.username);
    const { username, password } = req.body;

    if (!username || !password) {
        return res.render('register', { error: 'Username and password required' }, (err, html) => {
            if (err) return res.status(500).send('Error: ' + err.message);
            res.send(html);
        });
    }

    query('SELECT * FROM users WHERE username = ?', [username])
        .then(results => {
            if (results.length > 0) {
                return res.render('register', { error: 'Username already exists' }, (err, html) => {
                    if (err) return res.status(500).send('Error: ' + err.message);
                    res.send(html);
                });
            }

            const hashedPassword = bcrypt.hashSync(password, 10);
            return query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword])
                .then(() => res.redirect('/login'));
        })
        .catch(err => handleError(err, res, 'POST /register'));
});

// Login GET
app.get('/login', (req, res) => {
    console.log('[GET /login]');
    res.render('login', { error: null }, (err, html) => {
        if (err) {
            console.error('[RENDER ERROR - login]', err.message);
            return res.status(500).send('Error rendering login: ' + err.message);
        }
        res.send(html);
    });
});

// Login POST
app.post('/login', (req, res) => {
    console.log('[POST /login]', req.body.username);
    const { username, password } = req.body;

    query('SELECT * FROM users WHERE username = ?', [username])
        .then(results => {
            if (results.length > 0 && bcrypt.compareSync(password, results[0].password)) {
                req.session.userId = results[0].id;
                req.session.username = results[0].username;
                console.log('[LOGIN SUCCESS]', username);
                return res.redirect('/dashboard');
            }
            console.log('[LOGIN FAILED]', username);
            res.render('login', { error: 'Invalid username or password' }, (err, html) => {
                if (err) return res.status(500).send('Error: ' + err.message);
                res.send(html);
            });
        })
        .catch(err => handleError(err, res, 'POST /login'));
});

// Dashboard
app.get('/dashboard', (req, res) => {
    console.log('[GET /dashboard]', 'userId:', req.session.userId);
    
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
                console.log('[DASHBOARD] User not found');
                return res.redirect('/login');
            }

            console.log('[RENDER] dashboard');
            res.render('dashboard', {
                posts: userPosts,
                allPosts: allPosts,
                username: userResults[0].username
            }, (err, html) => {
                if (err) {
                    console.error('[RENDER ERROR - dashboard]', err.message);
                    return res.status(500).send('Error rendering dashboard: ' + err.message);
                }
                res.send(html);
            });
        })
        .catch(err => handleError(err, res, 'GET /dashboard'));
});

// Post Details
app.get('/post/:id', (req, res) => {
    console.log('[GET /post/:id]', req.params.id);
    query('SELECT * FROM posts WHERE id = ?', [req.params.id])
        .then(results => {
            if (results.length === 0) {
                return res.status(404).send('Post not found');
            }
            res.render('post', { post: results[0], userId: req.session.userId }, (err, html) => {
                if (err) {
                    console.error('[RENDER ERROR - post]', err.message);
                    return res.status(500).send('Error: ' + err.message);
                }
                res.send(html);
            });
        })
        .catch(err => handleError(err, res, 'GET /post/:id'));
});

// Create Post Form
app.get('/create-post', (req, res) => {
    console.log('[GET /create-post]');
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.render('create-post', {}, (err, html) => {
        if (err) {
            console.error('[RENDER ERROR - create-post]', err.message);
            return res.status(500).send('Error: ' + err.message);
        }
        res.send(html);
    });
});

// Create Post
app.post('/posts', (req, res) => {
    console.log('[POST /posts]', req.body.title);
    const { title, content, category } = req.body;
    const userId = req.session.userId;
    const writerName = req.session.username;

    if (!title || !content || !category) {
        return res.status(400).send('Title, content, and category required');
    }

    query('INSERT INTO posts (title, content, category, user_id, writer_name) VALUES (?, ?, ?, ?, ?)',
        [title, content, category, userId, writerName])
        .then(() => {
            console.log('[POST CREATED]');
            res.redirect('/dashboard');
        })
        .catch(err => handleError(err, res, 'POST /posts'));
});

// Delete Post
app.get('/delete-post/:id', (req, res) => {
    console.log('[GET /delete-post/:id]', req.params.id);
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
        .then(() => {
            console.log('[POST DELETED]', req.params.id);
            res.redirect('/dashboard');
        })
        .catch(err => handleError(err, res, 'GET /delete-post/:id'));
});

// Edit Post Form
app.get('/edit-post/:id', (req, res) => {
    console.log('[GET /edit-post/:id]', req.params.id);
    query('SELECT * FROM posts WHERE id = ?', [req.params.id])
        .then(results => {
            if (results.length === 0) {
                return res.status(404).send('Post not found');
            }
            res.render('edit-post', { post: results[0] }, (err, html) => {
                if (err) {
                    console.error('[RENDER ERROR - edit-post]', err.message);
                    return res.status(500).send('Error: ' + err.message);
                }
                res.send(html);
            });
        })
        .catch(err => handleError(err, res, 'GET /edit-post/:id'));
});

// Update Post
app.post('/update-post/:id', (req, res) => {
    console.log('[POST /update-post/:id]', req.params.id);
    const { title, content, category } = req.body;

    query('UPDATE posts SET title = ?, content = ?, category = ? WHERE id = ?',
        [title, content, category, req.params.id])
        .then(() => {
            console.log('[POST UPDATED]', req.params.id);
            res.redirect('/dashboard');
        })
        .catch(err => handleError(err, res, 'POST /update-post/:id'));
});

// Explore Posts
app.get('/explore-posts', (req, res) => {
    console.log('[GET /explore-posts]');
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    query('SELECT * FROM posts')
        .then(posts => {
            res.render('explore', { posts }, (err, html) => {
                if (err) {
                    console.error('[RENDER ERROR - explore]', err.message);
                    return res.status(500).send('Error: ' + err.message);
                }
                res.send(html);
            });
        })
        .catch(err => handleError(err, res, 'GET /explore-posts'));
});

// Suggested Posts (JSON)
app.get('/suggested-posts', (req, res) => {
    console.log('[GET /suggested-posts]');
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
            console.error('[ERROR /suggested-posts]', err.message);
            res.status(500).json({ error: 'Database error' });
        });
});

// Add Comment
app.post('/comments', (req, res) => {
    console.log('[POST /comments]');
    const { postId, comment } = req.body;
    const userId = req.session.userId;

    query('INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)',
        [postId, userId, comment])
        .then(() => {
            console.log('[COMMENT ADDED]');
            res.redirect('/dashboard');
        })
        .catch(err => handleError(err, res, 'POST /comments'));
});

// Search
app.get('/search', (req, res) => {
    console.log('[GET /search]', req.query.query);
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
            }, (err, html) => {
                if (err) {
                    console.error('[RENDER ERROR - search]', err.message);
                    return res.status(500).send('Error: ' + err.message);
                }
                res.send(html);
            });
        })
        .catch(err => handleError(err, res, 'GET /search'));
});

// Logout
app.get('/logout', (req, res) => {
    console.log('[GET /logout]');
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Delete Account
app.delete('/delete-account', (req, res) => {
    console.log('[DELETE /delete-account]');
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    query('DELETE FROM users WHERE id = ?', [userId])
        .then(() => {
            req.session.destroy(() => {
                console.log('[ACCOUNT DELETED]');
                res.json({ message: 'Account deleted successfully' });
            });
        })
        .catch(err => {
            console.error('[ERROR /delete-account]', err.message);
            res.status(500).json({ message: 'Error deleting account' });
        });
});

// Get Like Count
app.get('/post-likes/:postId', (req, res) => {
    console.log('[GET /post-likes/:postId]', req.params.postId);
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
            console.error('[ERROR /post-likes]', err.message);
            res.status(500).json({ error: 'Database error' });
        });
});

// Toggle Like
app.post('/like/:postId', (req, res) => {
    console.log('[POST /like/:postId]', req.params.postId);
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
                liked: true,
                like_count: results[0].like_count
            });
        })
        .catch(err => {
            console.error('[ERROR /like]', err.message);
            res.status(500).json({ error: 'Database error' });
        });
});

// 404 handler
app.use((req, res) => {
    console.log('[404]', req.method, req.url);
    res.status(404).send('Page not found');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[MIDDLEWARE ERROR]', err.message);
    console.error(err.stack);
    res.status(500).send('Internal Server Error: ' + err.message);
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✓ Server listening on port ${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV}`);
    console.log(`✓ Database: ${connectionConfig.host}\n`);
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
    console.error('[UNCAUGHT EXCEPTION]', err.message);
    process.exit(1);
});