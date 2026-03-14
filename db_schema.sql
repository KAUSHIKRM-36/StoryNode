-- Users table
CREATE TABLE `users` (
   `id` int NOT NULL AUTO_INCREMENT,
   `username` varchar(50) NOT NULL,
   `password` varchar(255) NOT NULL,
   PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Posts table
CREATE TABLE `posts` (
   `id` int NOT NULL AUTO_INCREMENT,
   `title` varchar(100) NOT NULL,
   `content` text NOT NULL,
   `category` varchar(50) NOT NULL,
   `user_id` int DEFAULT NULL,
   `writer_name` varchar(100) DEFAULT NULL,
   PRIMARY KEY (`id`),
   KEY `posts_ibfk_1` (`user_id`),
   CONSTRAINT `posts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Comments table
CREATE TABLE `comments` (
   `id` int NOT NULL AUTO_INCREMENT,
   `post_id` int DEFAULT NULL,
   `user_id` int DEFAULT NULL,
   `comment` text NOT NULL,
   PRIMARY KEY (`id`),
   KEY `comments_ibfk_1` (`post_id`),
   KEY `comments_ibfk_2` (`user_id`),
   CONSTRAINT `comments_ibfk_1` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
   CONSTRAINT `comments_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Likes table
CREATE TABLE `likes` (
   `id` int NOT NULL AUTO_INCREMENT,
   `user_id` int NOT NULL,
   `post_id` int NOT NULL,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`),
   UNIQUE KEY `unique_like` (`user_id`,`post_id`),
   KEY `post_id` (`post_id`),
   CONSTRAINT `likes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
   CONSTRAINT `likes_ibfk_2` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
