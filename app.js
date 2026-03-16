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

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper function to handle database query errors
const handleDatabaseError = (err, res) => {
    console.error('Database error:', err);
    res.status(500).send('Internal Server Error');
};

// Routes

// Home Page (index.ejs)
app.get('/', (req, res) => {
    const query = 'SELECT * FROM posts ORDER BY id DESC LIMIT 3'; // Fetch latest 3 posts
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
    
    // First check if username exists
    const checkQuery = 'SELECT * FROM users WHERE username = ?';
    db.query(checkQuery, [username], (err, results) => {
        if (err) return handleDatabaseError(err, res);
        
        if (results.length > 0) {
            // Username already exists
            return res.render('register', { 
                error: 'Username already exists. Please choose a different one.' 
            });
        }
        
        // Proceed with registration
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
    res.render('login', { error: null }); // Render login page without any error
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const query = 'SELECT * FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        if (results.length > 0 && bcrypt.compareSync(password, results[0].password)) {
            // Login successful
            req.session.userId = results[0].id;
            req.session.username = results[0].username; // Store username in session
            res.redirect('/dashboard');
        } else {
            // Login failed
            res.render('login', { error: 'Invalid username or password' }); // Pass error message to the template
        }
    });
});

// dashboard
app.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const userId = req.session.userId; // Get the userId from the session
    
    // Query to get the user's details (including the username) from the database
    const userQuery = 'SELECT username FROM users WHERE id = ?'; // Assuming users table has id and username
    db.query(userQuery, [userId], (err, userResults) => {
        if (err) return handleDatabaseError(err, res);

        // Check if the user exists
        if (userResults.length === 0) {
            return res.redirect('/login'); // If user not found, redirect to login
        }

        const username = userResults[0].username; // Get the username from the query result
        
        // Query to fetch all posts in the database
        const allPostsQuery = 'SELECT * FROM posts';
        db.query(allPostsQuery, (err, allPostResults) => {
            if (err) return handleDatabaseError(err, res);
            
            // Query to fetch the posts associated with this user
            const postsQuery = 'SELECT * FROM posts WHERE user_id = ?';
            db.query(postsQuery, [userId], (err, postResults) => {
                if (err) return handleDatabaseError(err, res);
                
                // Render the dashboard template and pass all posts and user-specific posts
                res.render('dashboard', { 
                    posts: postResults,  // Posts related to the current user
                    allPosts: allPostResults,  // All posts in the database
                    username: username 
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
        const post = results[0];
        res.render('post', { post, userId: req.session.userId });
    });
});

// Render the Create Post Form
app.get('/create-post', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login'); // Ensure the user is logged in
    }
    res.render('create-post'); // Render the create-post.ejs file
});

// Handle Create Post Form Submission
app.post('/posts', (req, res) => {
    const { title, content, category } = req.body;
    const userId = req.session.userId;
    const writerName = req.session.username; // Use username from session

    // Validate required fields
    if (!title || !content || !category) {
        return res.status(400).send('Title, content, and category are required.');
    }

    // Insert the new post into the database
    const query = `
        INSERT INTO posts (title, content, category, user_id, writer_name)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.query(query, [title, content, category, userId, writerName], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Internal Server Error');
        }
        res.redirect('/dashboard'); // Redirect to the dashboard after successful post creation
    });
});

// Delete Post
app.get('/delete-post/:id', (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId; // Get the logged-in user's ID

    // First, check if the post belongs to the logged-in user
    const checkQuery = 'SELECT user_id FROM posts WHERE id = ?';
    db.query(checkQuery, [postId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Internal Server Error');
        }

        if (results.length === 0) {
            return res.status(404).send('Post not found');
        }

        const postUserId = results[0].user_id;

        // Ensure the logged-in user is the owner of the post
        if (postUserId !== userId) {
            return res.status(403).send('You are not authorized to delete this post');
        }

        // Delete associated comments first
        const deleteCommentsQuery = 'DELETE FROM comments WHERE post_id = ?';
        db.query(deleteCommentsQuery, [postId], (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).send('Internal Server Error');
            }

            // Now delete the post
            const deletePostQuery = 'DELETE FROM posts WHERE id = ?';
            db.query(deletePostQuery, [postId], (err) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).send('Internal Server Error');
                }
                res.redirect('/dashboard'); // Redirect to the dashboard after successful deletion
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
        const post = results[0];
        res.render('edit-post', { post });
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

// Explore Posts Page
app.get('/explore-posts', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    const query = 'SELECT * FROM posts'; // Fetch all posts
    db.query(query, (err, results) => {
        if (err) return handleDatabaseError(err, res);
        res.render('explore', { posts: results });
    });
});

// Add a Comment
app.post('/comments', (req, res) => {
    const { postId, comment } = req.body;
    const userId = req.session.userId;
    const query = 'INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)';
    db.query(query, [postId, userId, comment], (err) => {
        if (err) return handleDatabaseError(err, res);
        res.redirect('/dashboard');
    });
});

// Search Posts Route
app.get('/search', (req, res) => {
    const query = req.query.query;  // Get the search query from the URL
    const userId = req.session.userId;
    
    // Query to search posts by title or content
    const sql = 'SELECT * FROM posts WHERE title LIKE ? OR content LIKE ?';
    db.query(sql, [`%${query}%`, `%${query}%`], (err, results) => {
        if (err) return handleDatabaseError(err, res);

        // Query to get the user's details (including the username)
        const userQuery = 'SELECT username FROM users WHERE id = ?';
        db.query(userQuery, [userId], (err, userResults) => {
            if (err) return handleDatabaseError(err, res);

            if (userResults.length === 0) {
                return res.redirect('/login'); // If user not found, redirect to login
            }

            const username = userResults[0].username;

            // Render the dashboard template with search results
            res.render('dashboard', {
                posts: results,  // Filtered posts based on search
                allPosts: results, // Pass the filtered posts to the 'allPosts' variable
                username: username,
                query: query  // Pass the search query back to the view
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
    db.query(deleteQuery, [userId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        // Destroy the session after account deletion
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
                return res.status(500).json({ message: 'Internal Server Error' });
            }
            res.status(200).json({ message: 'Account deleted successfully' });
        });
    });
});


// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});