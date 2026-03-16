const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || "dev-storynode_super_secret_key_123",
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

function parseConnectionString(url) {
    const urlObj = new URL(url);
    return {
        host: urlObj.hostname,
        user: urlObj.username,
        password: urlObj.password,
        database: urlObj.pathname.slice(1),
        port: parseInt(urlObj.port, 10) || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
}

const connectionConfig = parseConnectionString(process.env.MYSQL_URL);
const db = mysql.createConnection(connectionConfig);

db.connect((err) => {
    if (err) {
        console.error('Initial connection failed:', err.message);
        setTimeout(() => db.connect(), 5000);
    } else {
        console.log('Connected to MySQL successfully!');
    }
});

db.on('error', (err) => {
    console.error('Database error:', err.message);
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

// ============================================================================
// VIEW ENGINE SETUP
// ============================================================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const handleDatabaseError = (err, res) => {
    console.error('Database error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
};

const isAuthenticated = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// ============================================================================
// ROUTES - HOME
// ============================================================================

app.get('/', (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY id DESC LIMIT 3';
    db.query(query, (err, results) => {
        if (err) return handleDatabaseError(err, res);
        res.render('index', { posts: results });
    });
});

// ============================================================================
// ROUTES - AUTHENTICATION
// ============================================================================

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.render('register', { error: 'Username and password are required.' });
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

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Error destroying session:', err.message);
        res.redirect('/');
    });
});

// ============================================================================
// ROUTES - DASHBOARD
// ============================================================================

app.get('/dashboard', isAuthenticated, (req, res) => {
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

// ============================================================================
// ROUTES - POSTS
// ============================================================================

app.get('/create-post', isAuthenticated, (req, res) => {
    res.render('create-post');
});

app.post('/posts', isAuthenticated, (req, res) => {
    const { title, content, category } = req.body;
    const userId = req.session.userId;
    const writerName = req.session.username;

    if (!title || !content || !category) {
        return res.status(400).json({ error: 'Title, content, and category are required.' });
    }

    const query = `
        INSERT INTO posts (title, content, category, user_id, writer_name)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.query(query, [title, content, category, userId, writerName], (err) => {
        if (err) return handleDatabaseError(err, res);
        res.redirect('/dashboard');
    });
});

app.get('/post/:id', (req, res) => {
    const postId = req.params.id;
    const query = 'SELECT * FROM posts WHERE id = ?';
    db.query(query, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);
        
        if (results.length === 0) {
            return res.status(404).send('Post not found');
        }

        const post = results[0];
        res.render('post', { post, userId: req.session.userId });
    });
});

app.get('/edit-post/:id', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;

    const query = 'SELECT * FROM posts WHERE id = ?';
    db.query(query, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);
        
        if (results.length === 0) {
            return res.status(404).send('Post not found');
        }

        const post = results[0];

        if (post.user_id !== userId) {
            return res.status(403).send('You are not authorized to edit this post');
        }

        res.render('edit-post', { post });
    });
});

app.post('/update-post/:id', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;
    const { title, content, category } = req.body;

    if (!title || !content || !category) {
        return res.status(400).json({ error: 'Title, content, and category are required.' });
    }

    const checkQuery = 'SELECT user_id FROM posts WHERE id = ?';
    db.query(checkQuery, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length === 0) {
            return res.status(404).send('Post not found');
        }

        if (results[0].user_id !== userId) {
            return res.status(403).send('You are not authorized to update this post');
        }

        const query = 'UPDATE posts SET title = ?, content = ?, category = ? WHERE id = ?';
        db.query(query, [title, content, category, postId], (err) => {
            if (err) return handleDatabaseError(err, res);
            res.redirect('/dashboard');
        });
    });
});

app.get('/delete-post/:id', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;

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

            const deletePostQuery = 'DELETE FROM posts WHERE id = ?';
            db.query(deletePostQuery, [postId], (err) => {
                if (err) return handleDatabaseError(err, res);
                res.redirect('/dashboard');
            });
        });
    });
});

// ============================================================================
// ROUTES - EXPLORE & SEARCH
// ============================================================================

app.get('/explore-posts', isAuthenticated, (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY id DESC';
    db.query(query, (err, results) => {
        if (err) return handleDatabaseError(err, res);
        res.render('explore', { posts: results });
    });
});

app.get('/suggested-posts', isAuthenticated, (req, res) => {
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
        if (err) return handleDatabaseError(err, res);
        res.json({ posts: results });
    });
});

app.get('/search', isAuthenticated, (req, res) => {
    const searchQuery = req.query.query || '';
    const userId = req.session.userId;

    if (!searchQuery.trim()) {
        return res.render('dashboard', { 
            posts: [], 
            allPosts: [], 
            username: req.session.username,
            query: searchQuery 
        });
    }

    const sql = 'SELECT * FROM posts WHERE title LIKE ? OR content LIKE ? ORDER BY id DESC';
    db.query(sql, [`%${searchQuery}%`, `%${searchQuery}%`], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        res.render('dashboard', {
            posts: results,
            allPosts: results,
            username: req.session.username,
            query: searchQuery
        });
    });
});

// ============================================================================
// ROUTES - COMMENTS
// ============================================================================

app.post('/comments', isAuthenticated, (req, res) => {
    const { postId, comment } = req.body;
    const userId = req.session.userId;

    if (!postId || !comment) {
        return res.status(400).json({ error: 'Post ID and comment are required.' });
    }

    const query = 'INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)';
    db.query(query, [postId, userId, comment], (err) => {
        if (err) return handleDatabaseError(err, res);
        res.redirect(`/post/${postId}`);
    });
});

// ============================================================================
// ROUTES - LIKES
// ============================================================================

app.get('/post-likes/:postId', (req, res) => {
    const postId = req.params.postId;
    const userId = req.session.userId;

    const countQuery = 'SELECT COUNT(*) as like_count FROM likes WHERE post_id = ?';
    db.query(countQuery, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        const likeCount = results[0].like_count;

        if (!userId) {
            return res.json({ like_count: likeCount, user_liked: false });
        }

        const userLikeQuery = 'SELECT id FROM likes WHERE post_id = ? AND user_id = ?';
        db.query(userLikeQuery, [postId, userId], (err, results) => {
            if (err) return handleDatabaseError(err, res);

            const userLiked = results.length > 0;
            res.json({ like_count: likeCount, user_liked: userLiked });
        });
    });
});

app.post('/like/:postId', (req, res) => {
    const postId = req.params.postId;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const checkQuery = 'SELECT id FROM likes WHERE post_id = ? AND user_id = ?';
    db.query(checkQuery, [postId, userId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length > 0) {
            // Unlike
            const deleteQuery = 'DELETE FROM likes WHERE post_id = ? AND user_id = ?';
            db.query(deleteQuery, [postId, userId], (err) => {
                if (err) return handleDatabaseError(err, res);

                const countQuery = 'SELECT COUNT(*) as like_count FROM likes WHERE post_id = ?';
                db.query(countQuery, [postId], (err, results) => {
                    if (err) return handleDatabaseError(err, res);
                    res.json({ liked: false, like_count: results[0].like_count });
                });
            });
        } else {
            // Like
            const insertQuery = 'INSERT INTO likes (post_id, user_id) VALUES (?, ?)';
            db.query(insertQuery, [postId, userId], (err) => {
                if (err) return handleDatabaseError(err, res);

                const countQuery = 'SELECT COUNT(*) as like_count FROM likes WHERE post_id = ?';
                db.query(countQuery, [postId], (err, results) => {
                    if (err) return handleDatabaseError(err, res);
                    res.json({ liked: true, like_count: results[0].like_count });
                });
            });
        }
    });
});

// ============================================================================
// ROUTES - ACCOUNT
// ============================================================================

app.delete('/delete-account', isAuthenticated, (req, res) => {
    const userId = req.session.userId;

    const deleteQuery = 'DELETE FROM users WHERE id = ?';
    db.query(deleteQuery, [userId], (err) => {
        if (err) return handleDatabaseError(err, res);

        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err.message);
                return res.status(500).json({ message: 'Internal Server Error' });
            }
            res.status(200).json({ message: 'Account deleted successfully' });
        });
    });
});

// ============================================================================
// ERROR HANDLING & SERVER START
// ============================================================================

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unexpected error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});