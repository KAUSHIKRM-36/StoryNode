const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== DATABASE CONFIGURATION ==========
// Parse MYSQL_URL from Railway environment
const MYSQL_URL = process.env.MYSQL_URL;
let dbConfig = {};

if (MYSQL_URL) {
    try {
        const url = new URL(MYSQL_URL);
        dbConfig = {
            host: url.hostname,
            user: url.username,
            password: url.password,
            database: url.pathname.slice(1),
            port: url.port || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        };
    } catch (err) {
        console.error('Error parsing MYSQL_URL:', err);
        process.exit(1);
    }
} else {
    dbConfig = {
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'railway',
        port: process.env.MYSQL_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
}

console.log('MySQL Config:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    port: dbConfig.port,
    password: '***'
});

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.error('Initial connection failed:', err);
        setTimeout(() => db.connect(), 5000);
    } else {
        console.log('Connected to MySQL!');
    }
});

db.on('error', (err) => {
    console.error('Database error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        db.connect();
    }
    if (err.code === 'ER_CON_COUNT_ERROR') {
        setTimeout(() => db.connect(), 5000);
    }
    if (err.code === 'ER_AUTH_PLUGIN_CANNOT_LOAD') {
        setTimeout(() => db.connect(), 5000);
    }
});

// ========== MIDDLEWARE ==========
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict'
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========== HELPER FUNCTIONS ==========
const handleDatabaseError = (err, res) => {
    console.error('Database error:', err);
    res.status(500).send('Internal Server Error');
};

const checkAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

const validateInput = (input, minLength = 1, maxLength = 1000) => {
    if (!input || typeof input !== 'string') return false;
    const trimmed = input.trim();
    return trimmed.length >= minLength && trimmed.length <= maxLength;
};

// ========== ROUTES ==========

// Home Page
app.get('/', (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY id DESC LIMIT 3';
    db.query(query, (err, results) => {
        if (err) return handleDatabaseError(err, res);
        res.render('index', { posts: results });
    });
});

// User Registration
app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;

    if (!validateInput(username, 3, 50) || !validateInput(password, 6, 100)) {
        return res.render('register', { 
            error: 'Username must be 3-50 characters, password 6-100 characters.' 
        });
    }

    const checkQuery = 'SELECT id FROM users WHERE username = ?';
    db.query(checkQuery, [username], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length > 0) {
            return res.render('register', { 
                error: 'Username already exists. Please choose a different one.' 
            });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        const insertQuery = 'INSERT INTO users (username, password) VALUES (?, ?)';
        db.query(insertQuery, [username, hashedPassword], (err) => {
            if (err) return handleDatabaseError(err, res);
            res.redirect('/login');
        });
    });
});

// User Login
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.render('login', { error: 'Username and password are required.' });
    }

    const query = 'SELECT id, username, password FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length > 0 && bcrypt.compareSync(password, results[0].password)) {
            req.session.userId = results[0].id;
            req.session.username = results[0].username;
            res.redirect('/dashboard');
        } else {
            res.render('login', { error: 'Invalid username or password' });
        }
    });
});

// Dashboard
app.get('/dashboard', checkAuth, (req, res) => {
    const userId = req.session.userId;

    const userQuery = 'SELECT username FROM users WHERE id = ?';
    db.query(userQuery, [userId], (err, userResults) => {
        if (err) return handleDatabaseError(err, res);

        if (userResults.length === 0) {
            return res.redirect('/login');
        }

        const username = userResults[0].username;

        const allPostsQuery = 'SELECT * FROM posts ORDER BY id DESC';
        db.query(allPostsQuery, (err, allPostResults) => {
            if (err) return handleDatabaseError(err, res);

            const postsQuery = 'SELECT * FROM posts WHERE user_id = ? ORDER BY id DESC';
            db.query(postsQuery, [userId], (err, postResults) => {
                if (err) return handleDatabaseError(err, res);

                res.render('dashboard', { 
                    posts: postResults,
                    allPosts: allPostResults,
                    username: username 
                });
            });
        });
    });
});

// Post Details
app.get('/post/:id', (req, res) => {
    const postId = req.params.id;

    if (!Number.isInteger(parseInt(postId))) {
        return res.status(400).send('Invalid post ID');
    }

    const query = 'SELECT * FROM posts WHERE id = ?';
    db.query(query, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);
        if (results.length === 0) {
            return res.status(404).send('Post not found');
        }
        res.render('post', { post: results[0], userId: req.session.userId });
    });
});

// Render Create Post Form
app.get('/create-post', checkAuth, (req, res) => {
    res.render('create-post');
});

// Create Post
app.post('/posts', checkAuth, (req, res) => {
    const { title, content, category } = req.body;
    const userId = req.session.userId;
    const writerName = req.session.username;

    if (!validateInput(title, 5, 200) || !validateInput(content, 10, 10000) || !validateInput(category, 2, 50)) {
        return res.status(400).send('Invalid input: title (5-200 chars), content (10-10000 chars), category (2-50 chars)');
    }

    const query = 'INSERT INTO posts (title, content, category, user_id, writer_name) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [title, content, category, userId, writerName], (err) => {
        if (err) return handleDatabaseError(err, res);
        res.redirect('/dashboard');
    });
});

// Delete Post
app.get('/delete-post/:id', checkAuth, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;

    if (!Number.isInteger(parseInt(postId))) {
        return res.status(400).send('Invalid post ID');
    }

    const checkQuery = 'SELECT user_id FROM posts WHERE id = ?';
    db.query(checkQuery, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length === 0) {
            return res.status(404).send('Post not found');
        }

        if (results[0].user_id !== userId) {
            return res.status(403).send('You are not authorized to delete this post');
        }

        const deleteCommentsQuery = 'DELETE FROM comments WHERE post_id = ?';
        db.query(deleteCommentsQuery, [postId], (err) => {
            if (err) return handleDatabaseError(err, res);

            const deleteLikesQuery = 'DELETE FROM likes WHERE post_id = ?';
            db.query(deleteLikesQuery, [postId], (err) => {
                if (err) return handleDatabaseError(err, res);

                const deletePostQuery = 'DELETE FROM posts WHERE id = ?';
                db.query(deletePostQuery, [postId], (err) => {
                    if (err) return handleDatabaseError(err, res);
                    res.redirect('/dashboard');
                });
            });
        });
    });
});

// Edit Post (Show form)
app.get('/edit-post/:id', checkAuth, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;

    if (!Number.isInteger(parseInt(postId))) {
        return res.status(400).send('Invalid post ID');
    }

    const query = 'SELECT * FROM posts WHERE id = ? AND user_id = ?';
    db.query(query, [postId, userId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length === 0) {
            return res.status(403).send('You are not authorized to edit this post');
        }

        res.render('edit-post', { post: results[0] });
    });
});

// Update Post
app.post('/update-post/:id', checkAuth, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;
    const { title, content, category } = req.body;

    if (!validateInput(title, 5, 200) || !validateInput(content, 10, 10000) || !validateInput(category, 2, 50)) {
        return res.status(400).send('Invalid input');
    }

    if (!Number.isInteger(parseInt(postId))) {
        return res.status(400).send('Invalid post ID');
    }

    const checkQuery = 'SELECT user_id FROM posts WHERE id = ?';
    db.query(checkQuery, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length === 0 || results[0].user_id !== userId) {
            return res.status(403).send('You are not authorized to update this post');
        }

        const query = 'UPDATE posts SET title = ?, content = ?, category = ? WHERE id = ?';
        db.query(query, [title, content, category, postId], (err) => {
            if (err) return handleDatabaseError(err, res);
            res.redirect('/dashboard');
        });
    });
});

// Explore Posts
app.get('/explore-posts', checkAuth, (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY id DESC';
    db.query(query, (err, results) => {
        if (err) return handleDatabaseError(err, res);
        res.render('explore', { posts: results });
    });
});

// Suggested Posts
app.get('/suggested-posts', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.session.userId;

    const query = `
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
    `;

    db.query(query, [userId, userId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ posts: results });
    });
});

// Add Comment
app.post('/comments', checkAuth, (req, res) => {
    const { postId, comment } = req.body;
    const userId = req.session.userId;

    if (!validateInput(comment, 1, 5000)) {
        return res.status(400).send('Comment must be 1-5000 characters');
    }

    if (!Number.isInteger(parseInt(postId))) {
        return res.status(400).send('Invalid post ID');
    }

    const query = 'INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)';
    db.query(query, [postId, userId, comment], (err) => {
        if (err) return handleDatabaseError(err, res);
        res.redirect('/dashboard');
    });
});

// Search Posts
app.get('/search', checkAuth, (req, res) => {
    const searchQuery = req.query.query;
    const userId = req.session.userId;

    if (!searchQuery || searchQuery.trim().length === 0) {
        return res.redirect('/dashboard');
    }

    if (searchQuery.length > 100) {
        return res.status(400).send('Search query too long');
    }

    const sql = 'SELECT * FROM posts WHERE title LIKE ? OR content LIKE ? ORDER BY id DESC';
    db.query(sql, [`%${searchQuery}%`, `%${searchQuery}%`], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        const userQuery = 'SELECT username FROM users WHERE id = ?';
        db.query(userQuery, [userId], (err, userResults) => {
            if (err) return handleDatabaseError(err, res);

            if (userResults.length === 0) {
                return res.redirect('/login');
            }

            res.render('dashboard', {
                posts: results,
                allPosts: results,
                username: userResults[0].username,
                query: searchQuery
            });
        });
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/');
    });
});

// Delete Account
app.delete('/delete-account', checkAuth, (req, res) => {
    const userId = req.session.userId;

    const deletePostsQuery = 'DELETE FROM posts WHERE user_id = ?';
    db.query(deletePostsQuery, [userId], (err) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        const deleteUserQuery = 'DELETE FROM users WHERE id = ?';
        db.query(deleteUserQuery, [userId], (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ message: 'Internal Server Error' });
            }

            req.session.destroy((err) => {
                if (err) {
                    console.error('Session destruction error:', err);
                    return res.status(500).json({ message: 'Internal Server Error' });
                }
                res.status(200).json({ message: 'Account deleted successfully' });
            });
        });
    });
});

// Get Post Likes
app.get('/post-likes/:postId', (req, res) => {
    const postId = req.params.postId;
    const userId = req.session.userId;

    if (!Number.isInteger(parseInt(postId))) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }

    const countQuery = 'SELECT COUNT(*) as like_count FROM likes WHERE post_id = ?';
    db.query(countQuery, [postId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        const likeCount = results[0].like_count;

        if (!userId) {
            return res.json({ like_count: likeCount, user_liked: false });
        }

        const userLikeQuery = 'SELECT id FROM likes WHERE post_id = ? AND user_id = ?';
        db.query(userLikeQuery, [postId, userId], (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.json({ like_count: likeCount, user_liked: results.length > 0 });
        });
    });
});

// Toggle Like on Post
app.post('/like/:postId', (req, res) => {
    const postId = req.params.postId;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!Number.isInteger(parseInt(postId))) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }

    const checkQuery = 'SELECT id FROM likes WHERE post_id = ? AND user_id = ?';
    db.query(checkQuery, [postId, userId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length > 0) {
            // Unlike
            const deleteQuery = 'DELETE FROM likes WHERE post_id = ? AND user_id = ?';
            db.query(deleteQuery, [postId, userId], (err) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                const countQuery = 'SELECT COUNT(*) as like_count FROM likes WHERE post_id = ?';
                db.query(countQuery, [postId], (err, results) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ liked: false, like_count: results[0].like_count });
                });
            });
        } else {
            // Like
            const insertQuery = 'INSERT INTO likes (post_id, user_id) VALUES (?, ?)';
            db.query(insertQuery, [postId, userId], (err) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                const countQuery = 'SELECT COUNT(*) as like_count FROM likes WHERE post_id = ?';
                db.query(countQuery, [postId], (err, results) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ liked: true, like_count: results[0].like_count });
                });
            });
        }
    });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});