import * as Lex from 'lex-sdk';
import * as Aws from 'aws-sdk';
import * as Rp from 'request-promise';
const dynamo = new Aws.DynamoDB.DocumentClient({region: 'ap-northeast-1'});

let listItemEndpoint:string = '';
if (process.env.LISTITEM_ENDPOINT) {
    listItemEndpoint = process.env.LISTITEM_ENDPOINT;
}

let checkoutEndpoint:string = '';
if (process.env.CHECKOUT_ENDPOINT) {
    checkoutEndpoint = process.env.CHECKOUT_ENDPOINT;
}

let assetsEndpoint:string = '';
if (process.env.ASSETS_ENDPOINT) {
    assetsEndpoint = process.env.ASSETS_ENDPOINT;
}

let getItemEndpoint:string = '';
if (process.env.GETITEM_ENDPOINT) {
    getItemEndpoint = process.env.GETITEM_ENDPOINT;
}

let callbackUrl:string = '';
if (process.env.CALLBACK_ENDPOINT) {
    callbackUrl = process.env.CALLBACK_ENDPOINT;
}

let tableName:string = '';
if (process.env.TABLE_NAME) {
    tableName = process.env.TABLE_NAME;
}

const MenuIntentHandler = {
    canHandle(h: Lex.HandlerInput) {
        return (h.intentName === 'Menu')
    },
    async handle(h: Lex.HandlerInput) {
        if (h.source === Lex.InvocationSource.DialogCodeHook) {
            return h.responseBuilder
                .getDelegateResponse(h.attributes, h.slots);
        } else {
            let option:Rp.OptionsWithUri = {
                uri: listItemEndpoint
            }
            let data:string = await Rp.get(option).promise();
            let tmp = JSON.parse(data);
            console.log(tmp);

            let columns:{thumbnailImageUrl:string,title:string,text:string,actions:any[]}[] = [];
            for (let i=0; i<tmp.Items.length; i++) {
                let attributes: {price:number, image:string} = JSON.parse(tmp.Items[i].Attributes);
                let columnsData = {
                    thumbnailImageUrl: assetsEndpoint + attributes.image,
                    title: tmp.Items[i].productName,
                    text: '¥' + attributes.price + '-',
                    actions: [{
                        type: 'message',
                        label: 'Buy',
                        text: tmp.Items[i].productName
                    }]
                }
                console.log(columnsData);
                columns.push(columnsData);
            }

            let carouselObject:{type:string,columns:any[]} = {
                type: 'carousel',
                columns: columns
            }

            let template:{type:string,altText:string,template:any} = {
                type: 'template',
                altText: 'Your Menu',
                template: carouselObject
            }

            let menuAttention:{type:string,text:string} = {
                type: 'text',
                text: 'Here are your menus.'
            }

            let messageList = ['LINE', JSON.stringify(menuAttention), JSON.stringify(template)];
            let messageTemplate = messageList.join('|');

            console.log(messageTemplate);

            let message = {
                contentType: Lex.ContentType.PlainText,
                content: messageTemplate
            }
            //messageにLINEの仕様に沿ったレスポンスを生成
            return h.responseBuilder
                .getCloseResponse(
                    h.attributes,
                    Lex.FulfillmentState.Fulfilled,
                    message
                )
        }
    }
}

const OrderIntentHandler = {
    canHandle(h: Lex.HandlerInput) {
        return h.intentName === 'Order'
    },
    async handle(h: Lex.HandlerInput) {
        let drink:string = h.slots.drink;
        let orderId:string = h.requestEnvelope.userId + '_' + Date.now();

        //item
        let getItemOption:Rp.OptionsWithUri = {
            uri: getItemEndpoint + '?productName=' + encodeURI(drink)
        }
        let getItemData = await Rp.get(getItemOption).promise();
        console.log('getItemData: ' + getItemData);
        let item = JSON.parse(getItemData);
        console.log('itemName: ' + item.Item.productName);
        let itemAttributes = JSON.parse(item.Item.Attributes);
        console.log('itemAttribtues: ' + itemAttributes);

        //checkout
        let checkoutOption:Rp.OptionsWithUri = {
            uri: checkoutEndpoint,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                productName: item.Item.productName,
                price: itemAttributes.price,
                callbackUrl: callbackUrl,
                orderId: orderId
            })
        }
        let checkoutData = await Rp.post(checkoutOption).promise();
        console.log(JSON.stringify(checkoutData));
        let checkoutTmp = JSON.parse(checkoutData);

        //購入情報をDynamoDBに格納
        let attributes = {
            userId: h.requestEnvelope.userId,
            productName: item.Item.productName,
            amount: itemAttributes.price,
            paymentAccessToken: checkoutTmp.info.paymentAccessToken,
            transactionId: checkoutTmp.info.transactionId
        };
        let param:Aws.DynamoDB.DocumentClient.PutItemInput = {
            TableName: tableName,
            Item: {
                orderId: orderId,
                Attributes: JSON.stringify(attributes)
            }
        }
        
        let data:Aws.DynamoDB.DocumentClient.PutItemOutput = await dynamo.put(param).promise();
        console.log(JSON.stringify(data));

        //messageにLINEの仕様に沿ったレスポンスを生成
        let buttonObject = {
            type: 'buttons',
            thumbnailImageUrl: assetsEndpoint + itemAttributes.image,
            title: item.Item.productName,
            text: '¥' + itemAttributes.price + '-',
            actions: [{
                type: 'uri',
                label: 'Pay at LINEPay',
                uri: checkoutTmp.info.paymentUrl.web
            }]
        };

        console.log(JSON.stringify(buttonObject));

        let templateObject = {
            type: 'template',
            altText: drink,
            template: buttonObject
        };

        let messageList = ['LINE', JSON.stringify(templateObject)];
        let messageTemplate = messageList.join('|');
        let message = {
            contentType: Lex.ContentType.PlainText,
            content: messageTemplate
        }

        return h.responseBuilder
        .getCloseResponse(
            h.attributes,
            Lex.FulfillmentState.Fulfilled,
            message
        )
    }
}

const ErrorHandler = {
    canHandle(_h: Lex.HandlerInput, _error: Error) {
        return true;
    },
    handle(h: Lex.HandlerInput, error: Error) {
        const message =  {
            contentType: Lex.ContentType.PlainText, 
            content: "ERROR " + error.message };
        return h.responseBuilder
        .getCloseResponse(
            h.attributes,
            Lex.FulfillmentState.Fulfilled,
            message)
    }
}

let bot: Lex.Bot;
exports.handler = async(event: Lex.IntentRequest, context: any) => {
    console.log(JSON.stringify(event));
    if (!bot) {
        bot = Lex.BotBuilder()
            .addRequestHandlers(
                MenuIntentHandler,
                OrderIntentHandler
            )
            .addErrorHandler(ErrorHandler)
            .create();
    }
    return bot.invoke(event, context);
}