import * as Aws from 'aws-sdk';
import * as Line from '@line/bot-sdk';

let channelAccessToken:string = '';
let botName:string = '';
let botAlias:string = '';
if (process.env.CHANNEL_ACCESS_TOKEN) {
    channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
}
if (process.env.BOT_NAME) {
    botName = process.env.BOT_NAME;
}
if (process.env.BOT_ALIAS) {
    botAlias = process.env.BOT_ALIAS;
}

const Lex = new Aws.LexRuntime({region: 'us-east-1'});
const Client = new Line.Client({channelAccessToken: channelAccessToken});

exports.handler = async(event:any) => {
    console.log(JSON.stringify(event));
    let body = JSON.parse(event.body);

    let param:Aws.LexRuntime.PostTextRequest = {
        botName: botName,
        botAlias: botAlias,
        userId: body.events[0].source.userId,
        inputText: body.events[0].message.text
    }
    let data = await Lex.postText(param).promise();
    console.log(JSON.stringify(data));

    let lexResp;
    let resp:any[] = [];
    if (data.message != undefined) {
        lexResp = data.message.split('|');
        if (lexResp[0] == 'LINE') {
            for (let i=1; i<lexResp.length; i++) {
                let message = JSON.parse(lexResp[i]);
                resp.push(message);
            }
        } else {
            resp = [{
                type: 'text',
                text: data.message
            }]
        }
    } else {
        resp = [{
            type: 'text',
            text: 'ERROR'
        }];
    }

    let message:Line.Message[] = resp;
    console.log(JSON.stringify(resp));
    await Client.replyMessage(body.events[0].replyToken, message);

    let response = {
        isBase64Encoded: false,
        statusCode: 200,
        headers: {},
        body: ''
    };
    return response;
}