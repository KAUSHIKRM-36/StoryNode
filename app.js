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

// ✅ Use createPool instead of createConnection
const db = mysql.createPool(dbConfig);

// Test database connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err);
    } else {
        console.log('✅ Connected to MySQL!');
        connection.release();
    }
});

// ========== MIDDLEWARE ==========
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
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

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper function to handle database query errors
const handleDatabaseError = (err, res) => {
    console.error('Database error:', err);
    res.status(500).send('Internal Server Error');
};

// ========== ROUTES ==========

// Home Page
app.get('/', (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY id DESC LIMIT 3';
    db.query(query, (err, results) => {
        if (err) return handleDatabaseError(err, res);
        res.render('index', { posts: results || [] });
    });
});

// User Registration - GET
app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

// User Registration - POST
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
        return res.render('register', { 
            error: 'Username and password are required.' 
        });
    }

    if (password.length < 6) {
        return res.render('register', { 
            error: 'Password must be at least 6 characters long.' 
        });
    }

    if (username.length < 3) {
        return res.render('register', { 
            error: 'Username must be at least 3 characters long.' 
        });
    }
    
    // Check if username already exists
    const checkQuery = 'SELECT id FROM users WHERE username = ?';
    db.query(checkQuery, [username], (err, results) => {
        if (err) {
            console.error('Check username error:', err);
            return res.render('register', { 
                error: 'Database error. Please try again.' 
            });
        }
        
        if (results.length > 0) {
            return res.render('register', { 
                error: 'Username already exists. Please choose a different one.' 
            });
        }
        
        // Hash password and insert user
        try {
            const hashedPassword = bcrypt.hashSync(password, 10);
            const insertQuery = 'INSERT INTO users (username, password) VALUES (?, ?)';
            
            db.query(insertQuery, [username, hashedPassword], (err, results) => {
                if (err) {
                    console.error('Insert user error:', err);
                    return res.render('register', { 
                        error: 'Failed to create account. Please try again.' 
                    });
                }
                console.log('✅ User registered:', username);
                res.redirect('/login');
            });
        } catch (hashErr) {
            console.error('Hash error:', hashErr);
            return res.render('register', { 
                error: 'An error occurred. Please try again.' 
            });
        }
    });
});

// User Login - GET
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// User Login - POST
app.post('/login', (req, res) => {
    console.log('\n===== LOGIN ATTEMPT =====');
    console.log('Body received:', req.body);
    
    const { username, password } = req.body;
    
    console.log('Username:', username);
    console.log('Password provided:', !!password);

    if (!username || !password) {
        console.log('❌ Missing credentials');
        return res.render('login', { 
            error: 'Username and password are required.' 
        });
    }
    
    console.log('🔍 Searching for user:', username);
    const query = 'SELECT id, username, password FROM users WHERE username = ?';
    
    db.query(query, [username], (err, results) => {
        if (err) {
            console.error('❌ DATABASE ERROR:', err);
            return res.render('login', { 
                error: 'Database error: ' + err.message
            });
        }

        console.log('Users found:', results.length);
        
        if (results.length === 0) {
            console.log('❌ No user found with username:', username);
            return res.render('login', { 
                error: 'Invalid username or password' 
            });
        }

        const user = results[0];
        console.log('✅ User found:', user.username, '(ID:', user.id + ')');

        try {
            const isPasswordValid = bcrypt.compareSync(password, user.password);
            console.log('🔑 Password valid:', isPasswordValid);

            if (isPasswordValid) {
                console.log('✅ LOGIN SUCCESSFUL!');
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.save((err) => {
                    if (err) {
                        console.error('❌ Session save error:', err);
                        return res.render('login', { 
                            error: 'Session error: ' + err.message
                        });
                    }
                    console.log('✅ Session saved. User ID:', req.session.userId);
                    console.log('🔄 Redirecting to /dashboard');
                    res.redirect('/dashboard');
                });
            } else {
                console.log('❌ Password mismatch');
                res.render('login', { 
                    error: 'Invalid username or password' 
                });
            }
        } catch (compareErr) {
            console.error('❌ Bcrypt error:', compareErr);
            res.render('login', { 
                error: 'Authentication error' 
            });
        }
    });
});

// Dashboard
app.get('/dashboard', (req, res) => {
    console.log('\n===== DASHBOARD ACCESS =====');
    console.log('Session ID:', req.session.id);
    console.log('User ID in session:', req.session.userId);
    console.log('Username in session:', req.session.username);

    if (!req.session.userId) {
        console.log('❌ No userId in session - redirecting to /login');
        return res.redirect('/login');
    }

    const userId = req.session.userId;
    console.log('✅ User authenticated. Loading dashboard for user ID:', userId);
    
    // Get user details
    const userQuery = 'SELECT username FROM users WHERE id = ?';
    db.query(userQuery, [userId], (err, userResults) => {
        if (err) {
            console.error('❌ User query error:', err);
            return handleDatabaseError(err, res);
        }

        console.log('User query results:', userResults.length);

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
            const postsQuery = 'SELECT * FROM posts WHERE user_id = ? ORDER BY id DESC';
            db.query(postsQuery, [userId], (err, postResults) => {
                if (err) {
                    console.error('❌ User posts query error:', err);
                    return handleDatabaseError(err, res);
                }

                console.log('User posts found:', postResults.length);
                console.log('✅ Rendering dashboard');
                
                res.render('dashboard', { 
                    posts: postResults || [],
                    allPosts: allPostResults || [],
                    username: username,
                    userId: userId
                });
            });
        });
    });
});

// Post Details
app.get('/post/:id', (req, res) => {
    const postId = req.params.id;
    
    // Get post
    const query = 'SELECT * FROM posts WHERE id = ?';
    db.query(query, [postId], (err, results) => {
        if (err) return handleDatabaseError(err, res);
        
        if (results.length === 0) {
            return res.status(404).send('Post not found');
        }

        const post = results[0];
        
        // Get comments
        const commentsQuery = 'SELECT c.*, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.id DESC';
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

// Create Post - GET
app.get('/create-post', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.render('create-post');
});

// Create Post - POST
app.post('/posts', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).send('Unauthorized');
    }

    const { title, content, category } = req.body;
    const userId = req.session.userId;
    const writerName = req.session.username;

    // Validate
    if (!title || !content || !category) {
        return res.status(400).send('Title, content, and category are required.');
    }

    const query = `
        INSERT INTO posts (title, content, category, user_id, writer_name, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    `;
    
    db.query(query, [title, content, category, userId, writerName], (err, results) => {
        if (err) {
            console.error('Create post error:', err);
            return res.status(500).send('Internal Server Error');
        }
        console.log('✅ Post created by:', writerName);
        res.redirect('/dashboard');
    });
});

// Edit Post - GET
app.get('/edit-post/:id', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

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

// Update Post - POST
app.post('/update-post/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).send('Unauthorized');
    }

    const postId = req.params.id;
    const userId = req.session.userId;
    const { title, content, category } = req.body;

    // Verify ownership
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
app.get('/delete-post/:id', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

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

// Explore Posts
app.get('/explore-posts', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const query = 'SELECT * FROM posts ORDER BY id DESC';
    db.query(query, (err, results) => {
        if (err) return handleDatabaseError(err, res);
        res.render('explore', { posts: results || [] });
    });
});

// Add Comment
app.post('/comments', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { postId, comment } = req.body;
    const userId = req.session.userId;

    if (!postId || !comment) {
        return res.status(400).json({ message: 'Post ID and comment are required' });
    }

    const query = 'INSERT INTO comments (post_id, user_id, comment, created_at) VALUES (?, ?, ?, NOW())';
    db.query(query, [postId, userId, comment], (err, results) => {
        if (err) {
            console.error('Add comment error:', err);
            return res.status(500).json({ message: 'Failed to add comment' });
        }
        console.log('✅ Comment added');
        res.json({ message: 'Comment added successfully' });
    });
});

// Search Posts
app.get('/search', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const searchQuery = req.query.query || '';
    const userId = req.session.userId;

    if (!searchQuery) {
        return res.redirect('/dashboard');
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

            const username = userResults[0].username;

            res.render('dashboard', {
                posts: results || [],
                allPosts: results || [],
                username: username,
                userId: userId,
                query: searchQuery
            });
        });
    });
});

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
app.delete('/delete-account', (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // Delete user's comments
    const deleteCommentsQuery = 'DELETE FROM comments WHERE user_id = ?';
    db.query(deleteCommentsQuery, [userId], (err) => {
        if (err) {
            console.error('Delete comments error:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        // Delete user's posts
        const deletePostsQuery = 'DELETE FROM posts WHERE user_id = ?';
        db.query(deletePostsQuery, [userId], (err) => {
            if (err) {
                console.error('Delete posts error:', err);
                return res.status(500).json({ message: 'Internal Server Error' });
            }

            // Delete user
            const deleteUserQuery = 'DELETE FROM users WHERE id = ?';
            db.query(deleteUserQuery, [userId], (err) => {
                if (err) {
                    console.error('Delete user error:', err);
                    return res.status(500).json({ message: 'Internal Server Error' });
                }

                // Destroy session
                req.session.destroy((err) => {
                    if (err) {
                        console.error('Session destruction error:', err);
                        return res.status(500).json({ message: 'Internal Server Error' });
                    }
                    console.log('✅ Account deleted:', userId);
                    res.status(200).json({ message: 'Account deleted successfully' });
                });
            });
        });
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
});