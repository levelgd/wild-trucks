/**
 * Created by УровеньGD on 28.09.2015.
 */
var fs = require('fs');
var http = require('http');
var express = require('express');
var app = express();

var request = require('request');

var compress = require('compression');
app.use(compress());

app.use(express.static(__dirname + "/public/"));

app.get('/chatlog/', function (req, res) {
    res.sendFile(__dirname + '/public/chatlog.txt');
});

app.get('/faq/', function (req, res) {
    res.sendFile(__dirname + '/public/faq.html');
});

app.use(function(req, res, next){
    res.status(404).send("<h1 style='text-align: center'>leeho 404</h1>");
});

// для heroku следует указывать process.env.PORT в качестве порта
var server = http.createServer(app);
server.listen(process.env.PORT || 5000, function(){
    console.log('server started');
});

//---

var videos =[];
var videoQueue = 0;
var webm = /^https?:\/\/2ch.hk\/\w+\/src\/\d+\/\d+\.webm$/;

var who = [];
who["ural"] = "Урал";
who["gitler"] = "Гитлероподобный Грузовик";
who["igil"] = "Грузовик ИГИЛ";
who["zil"] = "Зил";

var sides = [];
sides["ural"] = 0;
sides["gitler"] = 0;
sides["igil"] = 0;

var frags = [];
frags["ural"] = 0;
frags["gitler"] = 0;
frags["igil"] = 0;

var map = [];
var mapSide = {};

var id = 0;
var players = [];
var clients = [];

var Player = function(x,z){
    this.id = "";
    this.x = x;
    this.z = z;
    this.ry = 0;
    this.side = "";
    this.frag = 0;
};

function spawnPlayer(side){

    if(side == 'ural'){
        return { x: 60 + Math.random() * 10 - 5, z: Math.random() * 10 - 5 }
    }
    else if(side == 'gitler'){
        return { x: -60 + Math.random() * 10 - 5, z: Math.random() * 10 - 5 }
    }
    else if(side == 'igil'){
        return { x: Math.random() * 10 - 5, z: -30 + Math.random() * 10 - 5 }
    }
    else if(side == 'zil'){
        return { x: Math.random() * 10 - 5, z: Math.random() * 10 - 5 }
    }
}

function ack(error) {
    if(error) console.log(error);
}

var websocket = require('ws').Server;
var wss = new websocket({ server: server });//openshift

wss.broadcast = function broadcast(data,without) {
    wss.clients.forEach(function each(client) {
        if(without != client) client.send(data, ack);
    });
};

var lastsource = "";
var lastwebm = "";
var nowplaying = "";

// смена видеоролика каждые 3 минуты
setInterval(function(){
    if(videos.length > 0 && clients.length > 0){

        nowplaying = videos.splice(0,1);

        wss.broadcast(JSON.stringify({message:'game-webm',src:nowplaying}),null);

        fs.appendFile('public/chatlog.txt', "► " + lastsource + "\n", 'utf8',function (err) {
            if (err) throw err;
        });

        if(lastwebm.length > 0 && fs.existsSync(lastwebm)){
            fs.unlinkSync(lastwebm);
        }

        lastwebm = "public/" + nowplaying;

        videoQueue--;
    }
}, 1000 * 60 * 3);

wss.on('connection', function(ws) {

    var vid = false;//обрабатывается ли запрос на добавление видео от игрока

    var admin = false;//админ ли игрок

    var player = null;
    var lasttime = Date.now();//для проверки дудоса, дата последнего принятого пакета
    var ddos = 0;

    ws.send(JSON.stringify({message:'info',online:players.length,fru:frags["ural"],frg:frags["gitler"],fri:frags["igil"]}), ack);

    ws.on('message', function(message) {

        if((Date.now() - lasttime) < 50){//проверка дудоса, 50мс это оптимальное значение
            if(ddos++ > 5) {
                return;
            }
        }else{
            if(ddos > 5){
                ws.close();
                return;
            }else{
                ddos = 0;
            }
        }

        lasttime = Date.now();

        try {
            message = JSON.parse(message);
        }catch (e){
            console.log(e.name);
            message.message = '';
        }

        //console.log(message.message);

        switch(message.message){

            case 'connect':

                if(!who.hasOwnProperty(message.side)){
                    ws.close();
                    return;
                }

                if(clients.indexOf(ws) > -1) return;

                //console.log(addTime() + 'gruzovique connected');

                var s = spawnPlayer(message.side);
                player = new Player(s.x, s.z);
                player.side = message.side;
                player.id = generateID();

                sides[message.side]++;

                players.push(player);
                clients.push(ws);

                ws.send(JSON.stringify({message:'game-players',players:players, mapside:mapSide, id:player.id, webm:nowplaying}), ack);

                wss.broadcast(JSON.stringify({message:'game-join',player:player}),ws);
                wss.broadcast(JSON.stringify({message:'game-log',text:'Новый ' + who[message.side] + ' в игре, так сказать'}),ws);

                setTimeout(function(){
                    ws.send(JSON.stringify({message:'game-log',text:'Вы играете в Лихие Грузовики Онлайн 0.0.9 rc4 jihad and loathing on ukraine edition, ну это и так понятно. ' +
                    'Ехать на стрелочки или WASD, чат на Enter, крутить камеру с зажатой ЛКМ. Сервер стал довольно часто падать, вероятно облако перезагружает его когда ' +
                    'нагрузка серв выше чем можно.'}), ack);
                },1000);

                break;

            case 'game-sync':

                player.x = message.x;
                player.z = message.y;
                player.ry = message.ry;

                wss.broadcast(JSON.stringify({
                    message: 'game-sync',
                    id: player.id,
                    key: message.key,
                    x:message.x,
                    z:message.z,
                    ry:message.ry
                }), ws);

                break;

            case 'game-chat':

                // если в чат скинули ссылку на вебмку
                if(webm.test(message.text)){

                    if(!vid && videoQueue < 1) {
                        vid = true;
                        videoQueue++; //в данной версии не поддерживаются очереди видео

                        var filename = 'res/webm/' + Date.now() + ".webm";

                        request(message.text, function (error, response, data) { //здесь проверяем не битая ли ссылка на вебмку
                            if (!error && response.statusCode == 200) {

                                lastsource = message.text;

                                videos.push(filename);
                                ws.send(JSON.stringify({
                                    message: 'game-log',
                                    text: ' Видео успешно добавлено в очередь.'
                                }), ack);

                                vid = false;
                            } else {
                                ws.send(JSON.stringify({
                                    message: 'game-log',
                                    text: ' Такого видео нет на двачете или криво введена ссылка.'
                                }), ack);

                                vid = false;
                                videoQueue--;
                            }
                        }).pipe(fs.createWriteStream("public/" + filename)); // загружаем видео на сервер. К сожалению, для видеотекстуры невозможно использовать видео напрямую с харкача из-за CORS
                    }else{
                        ws.send(JSON.stringify({ message: 'game-log', text: ' В очереди уже максимальное число вебмок, понятно что больше нельзя добавить' }), ack);
                    }

                }else if(!(/^\s*$/g).test(message.text)){ // Сообщение в чат

                    if(!admin && message.text == "password"){ //пароль от админки хардкодится тут.
                        admin = true;
                        ws.send(JSON.stringify({ message: 'game-log', text: 'ок' }), ack);
                        break;
                    }

                    if(message.text.length > 150) message.text = (message.text.substr(0,150) + "... вобщем не буду разжевывать, все и так понятно"); //режем слишком длинное сообщение чата

                    var text = escapeHtml(message.text);

                    var printid = player.id;

                    if(!admin){
                        wss.broadcast(JSON.stringify({ message:'game-log', text:text, id:player.id }),null);
                    }else{
                        wss.broadcast(JSON.stringify({ message:'game-log', text:text, id:"админ" }),null);
                        printid = "•админ•";
                    }

                    //запись в лог чата
                    fs.appendFile('public/chatlog.txt', "[ " + addTime() + "] " + printid + ": " + text + "\n", 'utf8',function (err) {
                        if (err) throw err;
                    });
                }

                break;

            case 'game-occ'://оккупация

                if(message.region == "") break;

                if(map[message.region] == undefined) map[message.region] = 0;

                if( map[message.region] < 5) {

                    map[message.region]++;

                    if (map[message.region] == 5) {
                        wss.broadcast(JSON.stringify({
                            message: 'game-occ',
                            region: message.region,
                            side: player.side
                        }), null);

                        if(Math.random() > .7){
                            ws.send(JSON.stringify({message:'game-130'}), ack);
                        }

                        map[message.region] = -5;
                        mapSide[message.region] = player.side;
                        wss.broadcast(JSON.stringify({message:'game-log',text: who[player.side] +  " оккупировал территорию"}),null);
                    }
                }

                break;

            case 'game-shoot':

                var x, z, to;

                if(player.side == "igil"){
                    x = message.x;
                    z = message.z;
                    to = 0;
                }else{
                    x = message.x + (Math.random() * 5 - 2.5);
                    z = message.z + (Math.random() * 5 - 2.5);
                    to = 1000;
                }

                setTimeout(function(){
                    wss.broadcast(JSON.stringify({
                        message: 'game-shoot',
                        x: x,
                        z: z,
                        id:player.id
                    }), null);
                }, to);

                break;

            case 'game-killed':

                wss.broadcast(JSON.stringify({message:'game-pwnd',id:player.id,killer:message.killer}),ws);

                if(message.killer != "w"){

                    var killerPlayer = players.filter(function (p) {
                        return p.id === message.killer;
                    })[0];

                    var txtY, txtK, txtYS, txtKS;

                    if(player.side == "igil"){
                        txtY = "Вы вознеслись к Аллаху";
                        txtYS = "Вы вознеслись к Аллаху";
                    }else{
                        txtY = "Вас одолел грузовик";
                        txtYS = 'Вас вероломно одолел дружественный грузовик. Вы не видите где свои где чужие.';
                    }

                    if(killerPlayer.side == "igil"){
                        txtK = "Благодаря вашему грузовику вражеский грузовик принял ислам";
                        txtKS = "Дружественные грузовики пострадали в результате теракта";
                    }else{
                        txtK = 'Вы прочистили территорию от вражеского грузовика';
                        txtKS = 'Вы прочистили территорию от дружественного грузовика';
                    }

                    if(killerPlayer.side == player.side){//player - убитый, killer - убийца
                        frags[killerPlayer.side]--;
                        ws.send(JSON.stringify({message:'game-log',text:txtYS}), ack);
                        clients[players.indexOf(killerPlayer)].send(JSON.stringify({message:'game-log',text:txtKS,frag:true}), ack);
                    }else{
                        frags[killerPlayer.side]++;
                        ws.send(JSON.stringify({message:'game-log',text:txtY}), ack);
                        clients[players.indexOf(killerPlayer)].send(JSON.stringify({message:'game-log',text:txtK,frag:true}), ack);
                    }
                }

                setTimeout(function(){
                    var coords = spawnPlayer( player.side );

                    wss.broadcast(JSON.stringify({message:'game-respawn',id:player.id,x:coords.x,z:coords.z}),null);//

                    setTimeout(function(){
                        wss.broadcast(JSON.stringify({message:'info',fru:frags["ural"],frg:frags["gitler"],fri:frags["igil"]}), null);
                    },100);

                },4000);

                break;
        }
    });

    ws.on('close', function(message){

        if(!player) return;

        sides[player.side]--;

        var index = players.indexOf(player);
        players.splice(index,1);
        clients.splice(index,1);
        wss.broadcast(JSON.stringify({message:'game-quit',id:player.id}),null);
        wss.broadcast(JSON.stringify({message:'game-log',text: who[player.side] + ' лихо покинул игру.'}),null);
    });

});

// возвращает строку - текущее время
function addTime(){
    var d = new Date();
    return d.toDateString().slice(4) + ", " + d.toTimeString().slice(0,8) + " ";
}

function generateID(){
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var chl = chars.length;
    var rndstring = "";
    for(var i = 0; i < 10; i++){
        rndstring += chars.substr( Math.round( Math.random() * chl ), 1 );
    }

    return rndstring;
}

function escapeHtml(text) {
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };

    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}