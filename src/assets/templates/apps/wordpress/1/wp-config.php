<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the web site, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * ABSPATH
 *
 * @link https://wordpress.org/documentation/article/editing-wp-config-php/
 *
 * @package WordPress
 */

define( 'WP_DEBUG', true );

define( 'WP_HOME', getenv('WP_HOME') ?: 'template_wordpress_endpoint' );
define( 'WP_SITEURL', getenv('WP_SITEURL') ?: 'template_wordpress_endpoint' );

// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', getenv('WORDPRESS_DB_NAME') ?: 'template_wordpress_db_name' );

/** Database username */
define( 'DB_USER', getenv('WORDPRESS_DB_USER') ?: 'template_wordpress_db_user' );

/** Database password */
define( 'DB_PASSWORD', getenv('WORDPRESS_DB_PASSWORD') ?: 'template_wordpress_db_pass' );

/** Database hostname */
define( 'DB_HOST', getenv('WORDPRESS_DB_HOST') ?: 'template_wordpress_db_host' );

/** Database charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8' );

/** The database collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',         'template_wordpress_auth_key' );
define( 'SECURE_AUTH_KEY',  'template_wordpress_secure_auth_key' );
define( 'LOGGED_IN_KEY',    'template_wordpress_logged_in_key' );
define( 'NONCE_KEY',        'template_wordpress_nonce_key' );
define( 'AUTH_SALT',        'template_wordpress_auth_salt' );
define( 'SECURE_AUTH_SALT', 'template_wordpress_secure_auth_salt' );
define( 'LOGGED_IN_SALT',   'template_wordpress_logged_in_salt' );
define( 'NONCE_SALT',       'template_wordpress_nonce_salt' );
define( 'FS_METHOD',        'direct' );

/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 */
$table_prefix = 'wp_';

/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://wordpress.org/documentation/article/debugging-in-wordpress/
 */

/* Add any custom values between this line and the "stop editing" line. */

// $_SERVER['HTTPS'] = 'on';

/* That's all, stop editing! Happy publishing. */

define('FORCE_SSL_ADMIN', true);  
if (strpos($_SERVER['HTTP_X_FORWARDED_PROTO'], 'https') !== false)  
    $_SERVER['HTTPS']='on';

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
