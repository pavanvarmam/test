import express, { json } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();

// app.use(cors({
//   origin: "http://ec2-40-192-121-1.ap-south-2.compute.amazonaws.com:4173"
// }));

app.use(json());

const server = createServer(app);

const io = new Server(server, {
  // cors: {
  //   origin: "http://ec2-40-192-121-1.ap-south-2.compute.amazonaws.com:4173"
  // }
});

const messages = ["Hello!", "How are you"];

app.get('/api/messages', (req, res) => {
  res.json(messages);
});

app.post('/api/messages', (req, res) => {

  const message = req.body?.message;

  messages.push(message);

  res.json(message);

});

app.delete('/api/messages', (req, res) => {
  messages.length = 0;
  res.json(messages);
});

io.on('connection', (socket) => {

  console.log('A user connected:', socket.id);

  socket.on('chat-message', (msg) => {

    console.log('Message received:', msg);

    messages.push(msg);

    io.emit('chat-message', msg);

  });

});

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});