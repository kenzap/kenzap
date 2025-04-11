from flask import Flask

# Create a Flask application
app = Flask(__name__)

# Define a route for the root URL
@app.route('/')
def hello():
    return "Hello, Docker! 🐳"

# Run the application
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)