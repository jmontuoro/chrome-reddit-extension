from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/receive_url', methods=['POST'])
def receive_url():
    data = request.get_json()
    print("🔗 Received URL:", data.get('url'))
    return jsonify({"status": "URL received", "received_url": data.get('url')}), 200

@app.route('/')
def root():
    return 'Reddit Extension Backend is Live!'

if __name__ == '__main__':
    app.run(debug=True)
