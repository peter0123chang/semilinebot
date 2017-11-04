const crypto = require('crypto');
const LineRequest = require('../services/LineRequest');

module.exports = {
  authentication: async (requestObj) => {
    const channelSecret = process.env.lineChannelSecret || '9a8c7887c8ed7ceb3f963ce8f73d64a9';
    const channelAccessToken = process.env.lineChannelAccessToken || '3cL4zroJybMhWDUTZPUnLbxzPjfsoNu5FO0EqmZ/fhOka8bgzPZBCCp2EkmVw4l5lRUhDRML3vSuT9wV+VUd/xzw02X6FL6nFi8LaaT8NDuJcNJaaIIyNDzB/C5dfeU21BS73yzS3jQ88fmlwQS1VAdB04t89/1O/w1cDnyilFU=';

    const xLineSignature = requestObj.headers['x-line-signature'];
    const requestBody = requestObj.body || {};

    const hash = crypto.createHmac('sha256', channelSecret)
                .update(Buffer.from(JSON.stringify(requestBody), 'utf8'))
                .digest('base64');

    return {
      hash,
      token: channelAccessToken,
      isValid: (hash === xLineSignature),
    };
  },
  reply: async (auth, requestEvents) => {
    const checkResult = LineRequest.checkRequestEventsCount(requestEvents);

    if (!checkResult.isPass) {
      return Promise.reject(checkResult);
    }

    const replyMessages = requestEvents.reduce((originData, currentReplyParam) => {
      if (LineRequest.isFakeReply(currentReplyParam.replyToken)) {
        return originData;
      }

      const replyType = currentReplyParam.type;

      switch (replyType) {
        case 'message':
          originData.push(LineRequest.createReplyRequest(auth, currentReplyParam));
          break;
        default:
        // case 'follow':

        //   break;
        // case 'unfollow':

        //   break;
        // case 'join':

        //   break;
        // case 'leave':

        //   break;
        // case 'postback':

        //   break;
        // case 'beacon':

        //   break;
      }

      return originData;
    }, []);

    try {
      return await Promise.all(replyMessages);
    } catch (e) {
      return e;
    }
  },
};
