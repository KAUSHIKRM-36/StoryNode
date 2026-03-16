const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== DATABASE CONFIGURATION ==========
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
    port: dbConfig.port
});

// ✅ Use createPool for better connection management
const db = mysql.createPool(dbConfig);

// Test connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
    } else {
        console.log('✅ Connected to MySQL!');
        connection.release();
    }
});

// ========== MIDDLEWARE ==========
// IMPORTANT: Body parser MUST come before routes
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Set up EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========== HELPER FUNCTIONS ==========
const handleDatabaseError = (err, res) => {
    console.error('Database error:', err);
    res.status(500).send('Internal Server Error');
};

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// ========== ROUTES ==========

// Home Page
app.get('/', (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY id DESC LIMIT 3';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Home page query error:', err);
            return res.render('index', { posts: [] });
        }
        res.render('index', { posts: results || [] });
    });
});

// ========== REGISTRATION ROUTES ==========

// Register GET
app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

// Register POST
app.post('/register', (req, res) => {
    console.log('\n===== REGISTRATION ATTEMPT =====');
    console.log('Body:', req.body);

    const { username, password, confirmPassword } = req.body;

    // Validation
    if (!username || !password || !confirmPassword) {
        console.log('❌ Missing required fields');
        return res.render('register', { 
            error: 'All fields are required.' 
        });
    }

    if (password.length < 6) {
        return res.render('register', { 
            error: 'Password must be at least 6 characters.' 
        });
    }

    if (password !== confirmPassword) {
        return res.render('register', { 
            error: 'Passwords do not match.' 
        });
    }

    if (username.length < 3) {
        return res.render('register', { 
            error: 'Username must be at least 3 characters.' 
        });
    }

    // Check if username exists
    const checkQuery = 'SELECT id FROM users WHERE username = ?';
    db.query(checkQuery, [username], (err, results) => {
        if (err) {
            console.error('❌ Check username error:', err);
            return res.render('register', { 
                error: 'Database error. Please try again.' 
            });
        }

        if (results.length > 0) {
            console.log('❌ Username already exists:', username);
            return res.render('register', { 
                error: 'Username already exists. Please choose another.' 
            });
        }

        // Hash password and insert
        try {
            const hashedPassword = bcrypt.hashSync(password, 10);
            const insertQuery = 'INSERT INTO users (username, password, created_at) VALUES (?, ?, NOW())';

            db.query(insertQuery, [username, hashedPassword], (err, results) => {
                if (err) {
                    console.error('❌ Insert user error:', err);
                    return res.render('register', { 
                        error: 'Failed to create account. Please try again.' 
                    });
                }

                console.log('✅ User registered successfully:', username);
                res.redirect('/login');
            });
        } catch (hashErr) {
            console.error('❌ Hash error:', hashErr);
            return res.render('register', { 
                error: 'An error occurred. Please try again.' 
            });
        }
    });
});

// ========== LOGIN ROUTES ==========

// Login GET
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// User Login - POST
app.post('/login', (req, res) => {
    console.log('\n===== LOGIN ATTEMPT =====');
    const { username, password } = req.body;
    
    console.log('Username:', username);
    console.log('Password provided:', password);

    if (!username || !password) {
        console.log('❌ Missing credentials');
        return res.render('login', { 
            error: 'Username and password are required.' 
        });
    }

    console.log('🔍 Querying database for user:', username);
    const query = 'SELECT id, username, password FROM users WHERE username = ?';

    db.query(query, [username], (err, results) => {
        if (err) {
            console.error('❌ Database query error:', err);
            return res.render('login', { 
                error: 'Database error. Please try again.' 
            });
        }

        console.log('Users found:', results.length);

        if (results.length === 0) {
            console.log('❌ User not found in database');
            return res.render('login', { 
                error: 'Invalid username or password.' 
            });
        }

        const user = results[0];
        console.log('✅ User found:', user.username);
        console.log('Stored password hash:', user.password);
        console.log('Hash starts with:', user.password.substring(0, 10));

        console.log('🔑 Comparing passwords...');
        console.log('Input password:', password);
        
        try {
            const isPasswordValid = bcrypt.compareSync(password, user.password);
            console.log('Comparison result:', isPasswordValid);

            if (isPasswordValid) {
                console.log('✅ PASSWORD MATCH - LOGIN SUCCESSFUL!');
                req.session.userId = user.id;
                req.session.username = user.username;
                console.log('Session set. Redirecting to /dashboard');
                return res.redirect('/dashboard');
            } else {
                console.log('❌ PASSWORD MISMATCH!');
                console.log('Input password does not match stored hash');
                return res.render('login', { 
                    error: 'Invalid username or password.' 
                });
            }
        } catch (compareErr) {
            console.error('❌ Bcrypt comparison error:', compareErr);
            return res.render('login', { 
                error: 'Authentication error: ' + compareErr.message
            });
        }
    });
});

// ========== DASHBOARD ROUTES ==========

// Dashboard GET
app.get('/dashboard', isAuthenticated, (req, res) => {
    console.log('\n===== DASHBOARD ACCESS =====');
    console.log('User ID:', req.session.userId);
    console.log('Username:', req.session.username);

    const userId = req.session.userId;

    // Get user details
    const userQuery = 'SELECT id, username FROM users WHERE id = ?';
    db.query(userQuery, [userId], (err, userResults) => {
        if (err) {
            console.error('❌ User query error:', err);
            return handleDatabaseError(err, res);
        }

        if (userResults.length === 0) {
            console.log('❌ User not found in database');
            req.session.destroy();
            return res.redirect('/login');
        }

        const username = userResults[0].username;
        console.log('✅ User found:', username);

        // Get all posts
        const allPostsQuery = 'SELECT * FROM posts ORDER BY id DESC';
        db.query(allPostsQuery, (err, allPostResults) => {
            if (err) {
                console.error('❌ All posts query error:', err);
                return handleDatabaseError(err, res);
            }

            console.log('All posts found:', allPostResults.length);

            // Get user's posts
            const userPostsQuery = 'SELECT * FROM posts WHERE user_id = ? ORDER BY id DESC';
            db.query(userPostsQuery, [userId], (err, userPostResults) => {
                if (err) {
                    console.error('❌ User posts query error:', err);
                    return handleDatabaseError(err, res);
                }

                console.log('User posts found:', userPostResults.length);
                console.log('✅ Rendering dashboard');

                res.render('dashboard', {
                    posts: userPostResults || [],
                    allPosts: allPostResults || [],
                    username: username,
                    userId: userId
                });
            });
        });
    });
});

// ========== POST ROUTES ==========

// Create Post GET
app.get('/create-post', isAuthenticated, (req, res) => {
    res.render('create-post');
});

// Create Post POST
app.post('/posts', isAuthenticated, (req, res) => {
    console.log('\n===== CREATE POST =====');
    console.log('Body:', req.body);

    const { title, content, category } = req.body;
    const userId = req.session.userId;
    const writerName = req.session.username;

    // Validation
    if (!title || !content || !category) {
        return res.status(400).send('Title, content, and category are required.');
    }

    const query = `
        INSERT INTO posts (title, content, category, user_id, writer_name, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    `;

    db.query(query, [title, content, category, userId, writerName], (err, results) => {
        if (err) {
            console.error('❌ Create post error:', err);
            return res.status(500).send('Internal Server Error');
        }

        console.log('✅ Post created:', results.insertId);
        res.redirect('/dashboard');
    });
});

// View Post
app.get('/post/:id', (req, res) => {
    const postId = req.params.id;

    const query = 'SELECT * FROM posts WHERE id = ?';
    db.query(query, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length === 0) {
            return res.status(404).send('Post not found');
        }

        const post = results[0];

        // Get comments
        const commentsQuery = `
            SELECT c.id, c.comment, c.created_at, u.username 
            FROM comments c 
            JOIN users u ON c.user_id = u.id 
            WHERE c.post_id = ? 
            ORDER BY c.created_at DESC
        `;

        db.query(commentsQuery, [postId], (err, comments) => {
            if (err) return handleDatabaseError(err, res);

            res.render('post', {
                post: post,
                comments: comments || [],
                userId: req.session.userId,
                username: req.session.username
            });
        });
    });
});

// Edit Post GET
app.get('/edit-post/:id', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;

    const query = 'SELECT * FROM posts WHERE id = ? AND user_id = ?';
    db.query(query, [postId, userId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length === 0) {
            return res.status(403).send('You are not authorized to edit this post');
        }

        res.render('edit-post', { post: results[0] });
    });
});

// Update Post POST
app.post('/update-post/:id', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;
    const { title, content, category } = req.body;

    // Check ownership
    const checkQuery = 'SELECT user_id FROM posts WHERE id = ?';
    db.query(checkQuery, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length === 0 || results[0].user_id !== userId) {
            return res.status(403).send('You are not authorized to update this post');
        }

        const updateQuery = 'UPDATE posts SET title = ?, content = ?, category = ? WHERE id = ?';
        db.query(updateQuery, [title, content, category, postId], (err) => {
            if (err) return handleDatabaseError(err, res);
            console.log('✅ Post updated:', postId);
            res.redirect('/dashboard');
        });
    });
});

// Delete Post
app.get('/delete-post/:id', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId;

    // Check ownership
    const checkQuery = 'SELECT user_id FROM posts WHERE id = ?';
    db.query(checkQuery, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length === 0) {
            return res.status(404).send('Post not found');
        }

        if (results[0].user_id !== userId) {
            return res.status(403).send('You are not authorized to delete this post');
        }

        // Delete comments first
        const deleteCommentsQuery = 'DELETE FROM comments WHERE post_id = ?';
        db.query(deleteCommentsQuery, [postId], (err) => {
            if (err) return handleDatabaseError(err, res);

            // Delete post
            const deletePostQuery = 'DELETE FROM posts WHERE id = ?';
            db.query(deletePostQuery, [postId], (err) => {
                if (err) return handleDatabaseError(err, res);
                console.log('✅ Post deleted:', postId);
                res.redirect('/dashboard');
            });
        });
    });
});

// ========== COMMENT ROUTES ==========

// Add Comment
app.post('/comments', isAuthenticated, (req, res) => {
    const { postId, comment } = req.body;
    const userId = req.session.userId;

    if (!postId || !comment) {
        return res.status(400).json({ message: 'Post ID and comment are required' });
    }

    const query = 'INSERT INTO comments (post_id, user_id, comment, created_at) VALUES (?, ?, ?, NOW())';
    db.query(query, [postId, userId, comment], (err, results) => {
        if (err) {
            console.error('❌ Add comment error:', err);
            return res.status(500).json({ message: 'Failed to add comment' });
        }

        console.log('✅ Comment added');
        res.json({ message: 'Comment added successfully' });
    });
});

// ========== EXPLORE ROUTES ==========

// Explore Posts
app.get('/explore-posts', isAuthenticated, (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY id DESC';
    db.query(query, (err, results) => {
        if (err) return handleDatabaseError(err, res);
        res.render('explore', { posts: results || [] });
    });
});

// ========== SEARCH ROUTES ==========

// Search Posts
app.get('/search', isAuthenticated, (req, res) => {
    const searchQuery = req.query.query || '';
    const userId = req.session.userId;

    if (!searchQuery) {
        return res.redirect('/dashboard');
    }

    const sql = 'SELECT * FROM posts WHERE title LIKE ? OR content LIKE ? ORDER BY id DESC';
    db.query(sql, [`%${searchQuery}%`, `%${searchQuery}%`], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        res.render('dashboard', {
            posts: results || [],
            allPosts: results || [],
            username: req.session.username,
            userId: userId,
            query: searchQuery
        });
    });
});

// ========== AUTH ROUTES ==========

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        console.log('✅ User logged out');
        res.redirect('/');
    });
});

// Delete Account
app.delete('/delete-account', isAuthenticated, (req, res) => {
    const userId = req.session.userId;

    // Delete comments
    const deleteCommentsQuery = 'DELETE FROM comments WHERE user_id = ?';
    db.query(deleteCommentsQuery, [userId], (err) => {
        if (err) {
            console.error('❌ Delete comments error:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        // Delete posts
        const deletePostsQuery = 'DELETE FROM posts WHERE user_id = ?';
        db.query(deletePostsQuery, [userId], (err) => {
            if (err) {
                console.error('❌ Delete posts error:', err);
                return res.status(500).json({ message: 'Internal Server Error' });
            }

            // Delete user
            const deleteUserQuery = 'DELETE FROM users WHERE id = ?';
            db.query(deleteUserQuery, [userId], (err) => {
                if (err) {
                    console.error('❌ Delete user error:', err);
                    return res.status(500).json({ message: 'Internal Server Error' });
                }

                // Destroy session
                req.session.destroy((err) => {
                    if (err) {
                        console.error('❌ Session destruction error:', err);
                        return res.status(500).json({ message: 'Internal Server Error' });
                    }

                    console.log('✅ Account deleted:', userId);
                    res.status(200).json({ message: 'Account deleted successfully' });
                });
            });
        });
    });
});

// ========== ERROR HANDLING ==========

// 404 Handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}\n`);
});