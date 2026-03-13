# Blogging Platform - Complete App Documentation

## Table of Contents
1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Database Schema](#database-schema)
4. [Authentication Flow](#authentication-flow)
5. [Core Features](#core-features)
6. [API Endpoints](#api-endpoints)
7. [User Journey](#user-journey)
8. [Recommendation System](#recommendation-system)
9. [Error Handling](#error-handling)

---

## Overview

**Blogging Platform** is a full-stack web application that enables users to:
- Create, read, update, and delete blog posts
- Like and interact with posts from other users
- Search and discover posts by category
- Receive personalized post recommendations based on their liking patterns
- Manage their user accounts and profile

**Architecture**: Client-Server (Express.js backend, EJS templating frontend, MySQL database)

---

## Tech Stack

### Backend
- **Framework**: Express.js 4.21.2
- **Runtime**: Node.js
- **Database**: MySQL 2
- **Authentication**: bcryptjs (password hashing)
- **Session Management**: express-session
- **Body Parsing**: body-parser

### Frontend
- **Templating**: EJS (Embedded JavaScript)
- **Styling**: Custom CSS
- **Icons**: Font Awesome 6.0
- **Client-side Logic**: Vanilla JavaScript (AJAX)

### Other
- **Environment**: dotenv
- **Server Port**: 3001

---

## Database Schema

### Table 1: `users`
```
id (INT, PRIMARY KEY, AUTO_INCREMENT)
username (VARCHAR, UNIQUE, NOT NULL)
password (VARCHAR, NOT NULL - bcrypt hashed)
created_at (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
```
**Purpose**: Store user credentials and authentication data

---

### Table 2: `posts`
```
id (INT, PRIMARY KEY, AUTO_INCREMENT)
title (VARCHAR, NOT NULL)
content (LONGTEXT, NOT NULL)
category (VARCHAR, NOT NULL)
user_id (INT, FOREIGN KEY → users.id)
writer_name (VARCHAR, NOT NULL)
created_at (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
```
**Purpose**: Store all blog posts with metadata
**Indexing**: user_id for faster queries on user's posts

---

### Table 3: `comments`
```
id (INT, PRIMARY KEY, AUTO_INCREMENT)
post_id (INT, FOREIGN KEY → posts.id)
user_id (INT, FOREIGN KEY → users.id)
comment (TEXT, NOT NULL)
created_at (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
```
**Purpose**: Store comments on posts
**Relationship**: Links users to posts they comment on

---

### Table 4: `likes` ⭐ (Recommendation Engine)
```
id (INT, PRIMARY KEY, AUTO_INCREMENT)
user_id (INT, FOREIGN KEY → users.id, ON DELETE CASCADE)
post_id (INT, FOREIGN KEY → posts.id, ON DELETE CASCADE)
created_at (TIMESTAMP, DEFAULT CURRENT_TIMESTAMP)
UNIQUE KEY (user_id, post_id) - Prevents duplicate likes
```
**Purpose**: Track user engagement and enable recommendations
**Key Feature**: UNIQUE constraint ensures one like per user per post

---

## Authentication Flow

### Step 1: User Registration
```
GET /register → Display registration form
    ↓
User enters username & password
    ↓
POST /register
    ↓
Validate: Username exists in DB?
    ├─ YES → Show error, re-render form
    └─ NO → Continue
    ↓
Hash password using bcryptjs (salt rounds: 10)
    ↓
INSERT INTO users (username, password_hash)
    ↓
Redirect to /login
```

**Security**: Passwords are never stored in plain text. bcryptjs hashes with 10 salt rounds.

---

### Step 2: User Login
```
GET /login → Display login form
    ↓
User enters username & password
    ↓
POST /login
    ↓
Query: SELECT * FROM users WHERE username = ?
    ↓
Found?
    ├─ NO → Invalid credentials error
    └─ YES → Compare password hash using bcryptjs
         ├─ Match? NO → Invalid credentials error
         └─ Match? YES → Continue
    ↓
CREATE SESSION:
    • req.session.userId = user.id
    • req.session.username = user.username
    ↓
Redirect to /dashboard
```

**Session Management**: User ID stored in session (server-side cookie)

---

### Step 3: Session Protection
Every protected route checks:
```javascript
if (!req.session.userId) {
    return res.redirect('/login');
}
```

---

## Core Features

### 1️⃣ Post Management

#### A. Create Post
```
GET /create-post
    ↓
User fills: Title, Content, Category
    ↓
POST /posts
    ↓
Validate all fields present
    ↓
INSERT INTO posts (title, content, category, user_id, writer_name)
    ↓
Redirect to /dashboard
```

**Data Validation**: Title, content, category required before insertion

---

#### B. View Post Details
```
GET /post/:id
    ↓
Query: SELECT * FROM posts WHERE id = ?
    ↓
Render post.ejs with:
    • Post content
    • Edit/Delete buttons (if owner)
    • Like button
    • Current user ID for authorization
```

**Authorization**: Edit/Delete buttons only shown to post creator

---

#### C. Edit Post
```
GET /edit-post/:id
    ↓
Query post and render edit form
    ↓
POST /update-post/:id
    ↓
Validate new data
    ↓
UPDATE posts SET title=?, content=?, category=? WHERE id=?
    ↓
Redirect to /dashboard
```

---

#### D. Delete Post
```
GET /delete-post/:id
    ↓
Verify: post owner == current user
    ├─ NO → Return 403 Forbidden
    └─ YES → Continue
    ↓
DELETE FROM comments WHERE post_id = ?
    (Cascade: Remove associated comments first)
    ↓
DELETE FROM posts WHERE id = ?
    ↓
Redirect to /dashboard
```

**Cascade Deletion**: Comments deleted before post to maintain referential integrity

---

### 2️⃣ Post Discovery

#### A. Dashboard (Home)
```
GET /dashboard
    ↓
Check authentication
    ├─ NOT logged in → Redirect to /login
    └─ Logged in → Continue
    ↓
Query user info: SELECT username FROM users WHERE id = ?
    ↓
Query all posts: SELECT * FROM posts
    ↓
Query user's own posts: SELECT * FROM posts WHERE user_id = ?
    ↓
Render dashboard.ejs with:
    • User's posts (top section)
    • All other posts (explore tab)
    • Suggested posts (lazy-loaded)
```

---

#### B. Search Posts
```
GET /search?query=keyword
    ↓
Query: SELECT * FROM posts 
       WHERE title LIKE %keyword% 
       OR content LIKE %keyword%
    ↓
Render dashboard with filtered results
```

**Search Type**: Full-text search across title and content

---

#### C. Explore Posts (Tab)
```
Show all posts in grid layout
    ↓
Each post card displays:
    • Title
    • First 150 chars of content
    • Category badge
    • Author name
    • Like button with count
```

---

#### D. Suggested Posts (Tab) ⭐ RECOMMENDATION ENGINE
```
GET /suggested-posts (AJAX)
    ↓
Auth check
    ↓
Query categories user has liked:
    SELECT DISTINCT category FROM posts
    WHERE id IN (
        SELECT post_id FROM likes WHERE user_id = ?
    )
    ↓
Get all posts in those categories:
    SELECT DISTINCT p.* FROM posts p
    WHERE p.category IN (liked_categories)
    AND p.id NOT IN (user_liked_posts)
    ORDER BY p.id DESC
    ↓
Return JSON with recommended posts
    ↓
Frontend renders dynamically
```

**Algorithm**: Content-based filtering (same category)
**Efficiency**: Lazy-loaded only when tab is clicked

---

### 3️⃣ Like System

#### A. Get Post Likes
```
GET /post-likes/:postId (AJAX)
    ↓
Query: SELECT COUNT(*) as like_count 
       FROM likes WHERE post_id = ?
    ↓
If logged in:
    Query: SELECT * FROM likes 
           WHERE post_id = ? AND user_id = ?
    ↓
Return JSON:
{
    like_count: <number>,
    user_liked: <boolean>
}
```

---

#### B. Toggle Like (Like/Unlike)
```
POST /like/:postId (AJAX)
    ↓
Auth check
    ├─ NOT logged in → Return 401
    └─ Logged in → Continue
    ↓
Check: Does user already like this post?
    Query: SELECT * FROM likes 
           WHERE post_id = ? AND user_id = ?
    ├─ YES (Like exists) → UNLIKE
    │  DELETE FROM likes WHERE post_id = ? AND user_id = ?
    └─ NO (Like doesn't exist) → LIKE
       INSERT INTO likes (user_id, post_id) VALUES (?, ?)
    ↓
Query updated like count
    ↓
Return JSON: {liked: <boolean>, like_count: <number>}
    ↓
Frontend updates UI instantly
```

**Toggle Mechanism**: Same endpoint adds/removes like
**UNIQUE Constraint**: Prevents accidental duplicates at DB level

---

### 4️⃣ Account Management

#### A. Logout
```
GET /logout
    ↓
req.session.destroy()
    ↓
Redirect to /
```

---

#### B. Delete Account
```
DELETE /delete-account (AJAX)
    ↓
Auth check
    ├─ NOT logged in → Return 401
    └─ Logged in → Continue
    ↓
DELETE FROM users WHERE id = ?
    (Cascade: Likes, comments, posts deleted due to FK constraints)
    ↓
req.session.destroy()
    ↓
Return JSON success
    ↓
Frontend redirects to /logout
```

**Cascade Delete**: All user data deleted from all tables automatically

---

## API Endpoints

| Method | Endpoint | Auth | Purpose | Returns |
|--------|----------|------|---------|---------|
| GET | `/` | No | Homepage with latest 3 posts | HTML |
| GET | `/register` | No | Registration form | HTML |
| POST | `/register` | No | Create user account | Redirect |
| GET | `/login` | No | Login form | HTML |
| POST | `/login` | No | Authenticate user | Redirect |
| GET | `/dashboard` | Yes | Main dashboard/feed | HTML |
| GET | `/post/:id` | Yes | View post details | HTML |
| GET | `/create-post` | Yes | Create post form | HTML |
| POST | `/posts` | Yes | Submit new post | Redirect |
| GET | `/edit-post/:id` | Yes | Edit post form | HTML |
| POST | `/update-post/:id` | Yes | Update post | Redirect |
| GET | `/delete-post/:id` | Yes | Delete post | Redirect |
| GET | `/search` | Yes | Search posts | HTML |
| GET | `/suggested-posts` | Yes | Get recommendations | JSON |
| POST | `/comments` | Yes | Add comment | Redirect |
| GET | `/post-likes/:postId` | No | Get like data | JSON |
| POST | `/like/:postId` | Yes | Toggle like | JSON |
| GET | `/logout` | Yes | Destroy session | Redirect |
| DELETE | `/delete-account` | Yes | Delete user account | JSON |

---

## User Journey

### Complete Lifecycle Flow

```
┌─────────────────────────────────────────────────────────┐
│                    LANDING PAGE (/)                      │
│         Display latest 3 posts (no auth needed)          │
│         CTA: Register or Login                           │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
   [REGISTER]           [LOGIN]
   /register             /login
        │                     │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │   SESSION CREATED   │
        │  (userId in cookie) │
        └──────────┬──────────┘
                   │
                   ▼
        ┌─────────────────────────────────────────┐
        │        DASHBOARD (/dashboard)           │
        │  ┌─────────────────────────────────┐    │
        │  │     USER'S OWN POSTS            │    │
        │  │  (Edit/Delete buttons visible)  │    │
        │  └─────────────────────────────────┘    │
        │  ┌─────────────────────────────────┐    │
        │  │  TAB: EXPLORE POSTS             │    │
        │  │  - All posts from all users     │    │
        │  │  - Like button on each          │    │
        │  │  - Search functionality         │    │
        │  └─────────────────────────────────┘    │
        │  ┌─────────────────────────────────┐    │
        │  │  TAB: SUGGESTED POSTS           │    │
        │  │  - Posts in liked categories    │    │
        │  │  - Personalized recommendations│    │
        │  │  - Lazy-loaded on first click   │    │
        │  └─────────────────────────────────┘    │
        └─────────────────────────────────────────┘
                   │
        ┌──────────┼──────────┬────────────────┐
        │          │          │                │
        ▼          ▼          ▼                ▼
    [CREATE]   [LIKE]    [SEARCH]       [VIEW DETAIL]
    /posts     /like/:id  /search        /post/:id
       │          │          │                │
       │ Creates  │ Tracks   │ Filters        │ Shows:
       │ new post │ engagement           • Full content
       │          │ in DB                • Like button
       │          │                      • Comments
       │          │                      • Edit/Delete
       │          │                      │ (if owner)
       └──────────┴──────────┴────────────┴─────┐
                             │
                        Recommended
                        algorithm
                        uses like
                        patterns
                             │
                             ▼
            USER KEEPS LIKING POSTS
                             │
                             ▼
            SUGGESTIONS GET SMARTER
                (More data = Better fits)
                             │
                             ▼
    ┌─────────────────────────────────────┐
    │  [LOGOUT]              [DELETE ACCOUNT]
    │  /logout               /delete-account
    │  Session destroyed     All data purged
    │  Redirects to /        From all tables
    └─────────────────────────────────────┘
```

---

## Recommendation System

### Algorithm Overview

**Type**: Content-Based Filtering (Category-based)

### Step-by-Step Logic

```
WHEN USER CLICKS "SUGGESTED POSTS" TAB
    │
    ▼
Find all posts user has liked:
    SELECT post_id FROM likes WHERE user_id = ?
    │
    ▼ (Example: user liked posts 1, 3, 5)
    │
Get categories of those posts:
    SELECT DISTINCT category FROM posts 
    WHERE id IN (1, 3, 5)
    │
    ▼ (Example: "Tech", "AI", "Tech")
    │
Get ALL posts in those categories:
    SELECT * FROM posts 
    WHERE category IN ("Tech", "AI")
    │
    ▼ (Found: posts 2, 4, 6, 7, 8, ...)
    │
Exclude posts user already liked:
    AND id NOT IN (1, 3, 5)
    │
    ▼ (Final: posts 2, 4, 6, 7, 8, ...)
    │
Return sorted newest first:
    ORDER BY id DESC
    │
    ▼
Display in Suggested Posts tab
```

### Query (Optimized)
```sql
SELECT DISTINCT p.* FROM posts p
WHERE p.category IN (
    SELECT DISTINCT p2.category FROM posts p2
    INNER JOIN likes l ON l.post_id = p2.id
    WHERE l.user_id = 123  -- User ID
)
AND p.id NOT IN (
    SELECT post_id FROM likes 
    WHERE user_id = 123
)
ORDER BY p.id DESC
```

### Example Scenario

```
User's Like History:
- Post 1: "Python Tips" (Category: Tech) ✓
- Post 3: "ML Basics" (Category: Tech) ✓
- Post 5: "Numpy Guide" (Category: Tech) ✓

System identifies: User likes Tech posts

Suggestion Query Returns:
- Post 2: "JavaScript" (Tech) - SHOWN
- Post 4: "React" (Tech) - SHOWN
- Post 6: "Vue.js" (Tech) - SHOWN
- Post 8: "Travel Guide" (Travel) - HIDDEN (different category)
- Post 7: "Food Review" (Food) - HIDDEN (different category)
- (Already liked posts hidden anyway)
```

---

## Error Handling

### Authentication Errors
```javascript
if (!req.session.userId) {
    return res.redirect('/login');  // GET requests
    return res.status(401).json({ error: 'Unauthorized' });  // AJAX
}
```

### Database Errors
```javascript
const handleDatabaseError = (err, res) => {
    console.error('Database error:', err);
    res.status(500).send('Internal Server Error');
};
```

### Authorization Errors
```javascript
// User trying to delete/edit others' posts
if (postUserId !== userId) {
    return res.status(403).send('You are not authorized to delete this post');
}
```

### Validation Errors
```javascript
// Missing required fields
if (!title || !content || !category) {
    return res.status(400).send('Title, content, and category are required.');
}

// Duplicate username on registration
if (results.length > 0) {
    return res.render('register', { 
        error: 'Username already exists. Please choose a different one.' 
    });
}
```

### Frontend AJAX Error Handling
```javascript
fetch('/suggested-posts')
    .then(response => response.json())
    .catch(error => {
        console.error('Error:', error);
        // Show user-friendly error message
    });
```

---

## Security Features

### 1. Password Security
- **Hashing**: bcryptjs with 10 salt rounds
- **Never stored in plain text**
- **Comparison**: Using bcryptjs.compareSync()

### 2. Session Management
- **Server-side sessions** (not JWT)
- **Cookie-based** with secure flag options
- **Automatic expiry** (configurable)

### 3. SQL Injection Prevention
- **Parameterized queries** everywhere
- **? placeholders** for all user inputs
- **No string concatenation** with user data

### 4. Authorization Checks
- **Route protection** on all sensitive endpoints
- **Ownership validation** before edit/delete
- **User verification** on like/comment operations

### 5. Database Constraints
- **UNIQUE constraint** on (user_id, post_id) in likes table
- **FOREIGN KEY constraints** ensure referential integrity
- **CASCADE DELETE** for automatic cleanup

---

## Performance Optimizations

### 1. Lazy Loading
- **Suggested posts** only load when tab clicked
- **Reduces initial page load time**

### 2. AJAX Calls
- **Like/unlike** doesn't require page reload
- **Smoother user experience**

### 3. Database Indexing
- **user_id indexed** in posts table (faster user queries)
- **UNIQUE key** on (user_id, post_id) in likes (fast lookups)

### 4. DISTINCT Queries
- **Prevents duplicate posts** in suggestions
- **Optimized for large datasets**

---

## Frontend Architecture

### EJS Templates
```
views/
├── index.ejs          (Homepage)
├── register.ejs       (Registration form)
├── login.ejs          (Login form)
├── dashboard.ejs      (Main app with tabs)
├── post.ejs           (Post detail page)
├── create-post.ejs    (Create post form)
├── edit-post.ejs      (Edit post form)
└── explore.ejs        (Explore page - optional)
```

### CSS Structure
```
public/css/
└── style.css
    ├── Navbar styles
    ├── Form styles
    ├── Post card styles
    ├── Like button styles
    ├── Tab navigation styles
    ├── Modal styles
    ├── Responsive grid layouts
    └── Animations & transitions
```

### JavaScript (Vanilla)
- **Tab switching**: Click handler with class manipulation
- **Like toggle**: AJAX POST with instant UI update
- **Modal management**: Delete account confirmation
- **Event delegation**: For dynamically loaded content

---

## Data Flow Diagrams

### Like Feature Data Flow
```
User clicks like button
        │
        ▼
JavaScript event listener
        │
        ▼
AJAX POST /like/:postId
        │
        ▼
Backend checks if like exists
        ├─ Exists: DELETE from likes
        └─ Not exists: INSERT into likes
        │
        ▼
Return updated like_count
        │
        ▼
Frontend updates:
- Heart icon (outline ↔ filled)
- Like count display
- Button styling
```

### Recommendation Data Flow
```
User logs in
        │
        ▼
Dashboard loads (like data hidden initially)
        │
        ▼
User clicks "Suggested Posts" tab
        │
        ▼
Frontend sends AJAX to /suggested-posts
        │
        ▼
Backend queries:
1. User's liked posts
2. Categories of those posts
3. All posts in those categories
4. Exclude already-liked posts
        │
        ▼
Return JSON with post array
        │
        ▼
Frontend dynamically renders HTML
        │
        ▼
Like buttons re-initialized
```

---

## Configuration

### Environment Variables (.env)
```
HOSTNAME=localhost          (MySQL host)
ROOT=root                   (MySQL user)
PASSWORD=your_password      (MySQL password)
DATABASE=blogging_app       (Database name)
SECRATE_KEY=your_secret     (Session secret)
```

### Database Setup
```sql
-- Create database
CREATE DATABASE IF NOT EXISTS blogging_app;

-- Create tables (see Database Schema section)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);

CREATE TABLE posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content LONGTEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    user_id INT NOT NULL,
    writer_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    post_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_like (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_post_id (post_id)
);

CREATE TABLE comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## Deployment Checklist

- [ ] Set secure session secret in .env
- [ ] Configure environment variables for production database
- [ ] Enable HTTPS and set `secure: true` in session cookie
- [ ] Set up database backups
- [ ] Configure logging for production
- [ ] Implement rate limiting for API endpoints
- [ ] Add CORS if needed for future API clients
- [ ] Test all authentication flows
- [ ] Verify like/unlike functionality
- [ ] Test recommendation algorithm with sample data
- [ ] Load test with concurrent users

---

## Future Enhancement Ideas

1. **Advanced Recommendations**
   - Collaborative filtering (users who liked X also liked Y)
   - Machine learning-based suggestions
   - Time-decay (recent likes weighted higher)

2. **Social Features**
   - User follow system
   - Direct messaging
   - Comment replies/threading

3. **Analytics**
   - User engagement metrics
   - Most liked posts dashboard
   - Category popularity trends

4. **UI/UX**
   - Post editing drafts
   - Scheduled post publishing
   - Rich text editor for content
   - User avatars

5. **Performance**
   - Caching layer (Redis)
   - Pagination for large datasets
   - Image optimization

---

## Troubleshooting

### Issue: 500 Internal Server Error
**Cause**: Database connection failure  
**Solution**: Check .env file, verify MySQL is running

### Issue: Username already exists error
**Cause**: Attempting to register with existing username  
**Solution**: Use unique username

### Issue: "You are not authorized" on edit
**Cause**: Trying to edit/delete post by different user  
**Solution**: Only post owner can modify

### Issue: No suggested posts appearing
**Cause**: User hasn't liked any posts yet  
**Solution**: Like some posts first, then check suggestions

---

## Support & Contact

For issues, refer to app logs at server console.
All database errors logged with timestamp and error details.

---

**Last Updated**: December 2024  
**Version**: 1.0  
**Status**: Production Ready
