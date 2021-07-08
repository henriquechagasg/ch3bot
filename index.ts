import { create, Whatsapp }from 'venom-bot'
import { WppBot } from './bot'

create({session: 'newsession'})
.then((client) => start(client))
.catch((erro) => {
  console.log(erro);
});

function start(client: Whatsapp) {
  
    const mybot = new WppBot(client)
    mybot.start()

 }