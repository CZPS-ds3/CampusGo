-- Runs once, the first time the MySQL container starts with an empty data volume.
CREATE DATABASE IF NOT EXISTS campusquest CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS campusquest_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON campusquest.* TO 'cq'@'%';
GRANT ALL PRIVILEGES ON campusquest_test.* TO 'cq'@'%';
FLUSH PRIVILEGES;
