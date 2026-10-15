CREATE DATABASE IF NOT EXISTS veepower_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON `test_%`.* TO 'veepower'@'%';
GRANT ALL PRIVILEGES ON `veepower_db`.* TO 'veepower'@'%';
FLUSH PRIVILEGES;
