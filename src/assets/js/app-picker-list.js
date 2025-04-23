
import global from "./global.js"
import { __html } from './helpers.js'

export const appList = [
    { name: "Nginx", description: "High-performance HTTP server and reverse proxy", image: "nginx", icon: "https://kenzap.cloud/static/apps/nginx.svg" },
    { name: "MySQL", description: "Relational database management system", image: "mysql", icon: "https://kenzap.cloud/static/apps/mysql.svg" },
    { name: "PostgreSQL", description: "Advanced open-source relational database", image: "postgres", icon: "https://kenzap.cloud/static/apps/postgres.svg" },
    { name: "Apache", description: "Popular HTTP server", image: "apache", icon: "https://kenzap.cloud/static/apps/apache.svg" },
    { name: "Redis", description: "In-memory data structure store", image: "redis", icon: "https://kenzap.cloud/static/apps/redis.svg" },
    // { name: "MongoDB", description: "NoSQL document-oriented database", image: "mongo", icon: "https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/nginx.svg" },
    { name: "Node.js", description: "JavaScript runtime environment", image: "node", icon: "https://kenzap.cloud/static/apps/nodejs.svg" },
    { name: "Python", description: "Python runtime environment", image: "python", icon: "https://kenzap.cloud/static/apps/python.svg" },
    { name: "WordPress", description: "Content management system", image: "wordpress", icon: "https://kenzap.cloud/static/apps/wordpress.svg" },
    { name: "PHP", description: "Automation server for CI/CD", image: "php", icon: "https://kenzap.cloud/static/apps/php.svg" },
    { name: "Ktor", description: "A framework for building asynchronous applications", image: "ktor", icon: "https://kenzap.cloud/static/apps/ktor.svg" },
    // { name: "Jenkins", description: "Automation server for CI/CD", image: "jenkins" },
    // { name: "Elasticsearch", description: "Search and analytics engine", image: "elasticsearch" },
    // { name: "Kibana", description: "Visualization tool for Elasticsearch", image: "kibana" },
    // { name: "Grafana", description: "Visualization and monitoring platform", image: "grafana/grafana" },
    // { name: "Prometheus", description: "Monitoring and alerting toolkit", image: "prom/prometheus" },
    // { name: "RabbitMQ", description: "Message broker for communication", image: "rabbitmq" },
    { name: "Alpine", description: "Minimal Docker image for lightweight containers", image: "alpine", icon: "https://kenzap.cloud/static/apps/alpine.svg" },
    { name: "Adminer", description: "Database management in a single PHP file", image: "adminer", icon: "https://kenzap.cloud/static/apps/adminer.svg" },
    { name: "MyTicket WP", description: "Organize events, sell and validate tickets in WordPress.", image: "myticket-wp", icon: "https://kenzap.cloud/static/apps/myticket.svg" }
];