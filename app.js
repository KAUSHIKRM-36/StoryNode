const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory session store
app.use(session({
    secret: process.env.SESSION_SECRET || "dev-storynode_super_secret_key_123",
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Database connection - FIXED
const db = mysql.createConnection({
    host: process.env.MYSQL_HOST || 'mysql.railway.internal',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'mgLsyNFcNWXRAVmltePDBnJDNWkfenKs',
    database: process.env.MYSQL_DATABASE || 'railway',
    port: process.env.MYSQL_PORT || 3306
});

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

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper function to handle database query errors
const handleDatabaseError = (err, res) => {
    console.error('Database error:', err);
    res.status(500).send('Internal Server Error');
};

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Home Page
app.get('/', (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY id DESC LIMIT 3';
    db.query(query, (err, results) => {
        if (err) return handleDatabaseError(err, res);
        res.render('index', { posts: results }, (err, html) => {
            if (err) {
                console.error('Render error:', err.message);
                return res.status(500).send('Error: ' + err.message);
            }
            res.send(html);
        });
    });
});

// User Registration
app.get('/register', (req, res) => {
    res.render('register', { error: null }, (err, html) => {
        if (err) return res.status(500).send('Error: ' + err.message);
        res.send(html);
    });
});

app.post('/register', (req, res) => {
    const { username, password } = req.body;

    const checkQuery = 'SELECT * FROM users WHERE username = ?';
    db.query(checkQuery, [username], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length > 0) {
            return res.render('register', { error: 'Username already exists' }, (err, html) => {
                if (err) return res.status(500).send('Error');
                res.send(html);
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
    res.render('login', { error: null }, (err, html) => {
        if (err) return res.status(500).send('Error: ' + err.message);
        res.send(html);
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const query = 'SELECT * FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length > 0 && bcrypt.compareSync(password, results[0].password)) {
            req.session.userId = results[0].id;
            req.session.username = results[0].username;
            res.redirect('/dashboard');
        } else {
            res.render('login', { error: 'Invalid username or password' }, (err, html) => {
                if (err) return res.status(500).send('Error');
                res.send(html);
            });
        }
    });
});

// Dashboard
app.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const userId = req.session.userId;
    const userQuery = 'SELECT username FROM users WHERE id = ?';
    
    db.query(userQuery, [userId], (err, userResults) => {
        if (err) return handleDatabaseError(err, res);

        if (userResults.length === 0) {
            return res.redirect('/login');
        }

        const username = userResults[0].username;
        const allPostsQuery = 'SELECT * FROM posts';
        
        db.query(allPostsQuery, (err, allPostResults) => {
            if (err) return handleDatabaseError(err, res);

            const postsQuery = 'SELECT * FROM posts WHERE user_id = ?';
            db.query(postsQuery, [userId], (err, postResults) => {
                if (err) return handleDatabaseError(err, res);

                res.render('dashboard', { 
                    posts: postResults,
                    allPosts: allPostResults,
                    username: username 
                }, (err, html) => {
                    if (err) {
                        console.error('Render error:', err.message);
                        return res.status(500).send('Error: ' + err.message);
                    }
                    res.send(html);
                });
            });
        });
    });
});

// Post Details
app.get('/post/:id', (req, res) => {
    const postId = req.params.id;
    const query = 'SELECT * FROM posts WHERE id = ?';
    db.query(query, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);
        if (results.length === 0) return res.status(404).send('Post not found');
        res.render('post', { post: results[0], userId: req.session.userId }, (err, html) => {
            if (err) return res.status(500).send('Error: ' + err.message);
            res.send(html);
        });
    });
});

// Create Post Form
app.get('/create-post', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.render('create-post', {}, (err, html) => {
        if (err) return res.status(500).send('Error: ' + err.message);
        res.send(html);
    });
});

// Create Post
app.post('/posts', (req, res) => {
    const { title, content, category } = req.body;
    const userId = req.session.userId;
    const writerName = req.session.username;

    if (!title || !content || !category) {
        return res.status(400).send('Title, content, and category are required.');
    }

    const query = 'INSERT INTO posts (title, content, category, user_id, writer_name) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [title, content, category, userId, writerName], (err) => {
        if (err) return handleDatabaseError(err, res);
        res.redirect('/dashboard');
    });
});

// Delete Post
app.get('/delete-post/:id', (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;

    const checkQuery = 'SELECT user_id FROM posts WHERE id = ?';
    db.query(checkQuery, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length === 0) {
            return res.status(404).send('Post not found');
        }

        if (results[0].user_id !== userId) {
            return res.status(403).send('Unauthorized');
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

// Edit Post
app.get('/edit-post/:id', (req, res) => {
    const postId = req.params.id;
    const query = 'SELECT * FROM posts WHERE id = ?';
    db.query(query, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);
        if (results.length === 0) return res.status(404).send('Post not found');
        res.render('edit-post', { post: results[0] }, (err, html) => {
            if (err) return res.status(500).send('Error: ' + err.message);
            res.send(html);
        });
    });
});

// Update Post
app.post('/update-post/:id', (req, res) => {
    const postId = req.params.id;
    const { title, content, category } = req.body;
    const query = 'UPDATE posts SET title = ?, content = ?, category = ? WHERE id = ?';
    db.query(query, [title, content, category, postId], (err) => {
        if (err) return handleDatabaseError(err, res);
        res.redirect('/dashboard');
    });
});

// Explore Posts
app.get('/explore-posts', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    const query = 'SELECT * FROM posts';
    db.query(query, (err, results) => {
        if (err) return handleDatabaseError(err, res);
        res.render('explore', { posts: results }, (err, html) => {
            if (err) return res.status(500).send('Error: ' + err.message);
            res.send(html);
        });
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
app.post('/comments', (req, res) => {
    const { postId, comment } = req.body;
    const userId = req.session.userId;
    const query = 'INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)';
    db.query(query, [postId, userId, comment], (err) => {
        if (err) return handleDatabaseError(err, res);
        res.redirect('/dashboard');
    });
});

// Search Posts
app.get('/search', (req, res) => {
    const searchQuery = req.query.query;
    const userId = req.session.userId;

    if (!searchQuery) {
        return res.redirect('/dashboard');
    }

    const sql = 'SELECT * FROM posts WHERE title LIKE ? OR content LIKE ?';
    db.query(sql, [`%${searchQuery}%`, `%${searchQuery}%`], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        const userQuery = 'SELECT username FROM users WHERE id = ?';
        db.query(userQuery, [userId], (err, userResults) => {
            if (err) return handleDatabaseError(err, res);

            if (userResults.length === 0) {
                return res.redirect('/login');
            }

            const username = userResults[0].username;
            res.render('dashboard', {
                posts: results,
                allPosts: results,
                username: username,
                query: searchQuery
            }, (err, html) => {
                if (err) return res.status(500).send('Error: ' + err.message);
                res.send(html);
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
app.delete('/delete-account', (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const deleteQuery = 'DELETE FROM users WHERE id = ?';
    db.query(deleteQuery, [userId], (err) => {
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

// Get Like Count
app.get('/post-likes/:postId', (req, res) => {
    const postId = req.params.postId;
    const userId = req.session.userId;

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

        const userLikeQuery = 'SELECT * FROM likes WHERE post_id = ? AND user_id = ?';
        db.query(userLikeQuery, [postId, userId], (err, results) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            const userLiked = results.length > 0;
            res.json({ like_count: likeCount, user_liked: userLiked });
        });
    });
});

// Toggle Like
app.post('/like/:postId', (req, res) => {
    const postId = req.params.postId;
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const checkQuery = 'SELECT * FROM likes WHERE post_id = ? AND user_id = ?';
    db.query(checkQuery, [postId, userId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length > 0) {
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

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).send('Internal Server Error');
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});