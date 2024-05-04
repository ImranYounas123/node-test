import { Op } from 'sequelize'
import { ConversationModel, MessageModel, UserModel } from '../../models'

export const get = async (request, response) => {
    let {
        query: { keyword, orderBy, order },
    } = request

    if (!order) request.query.order = 'ASC'
    if (!orderBy) request.query.orderBy = 'id'

    let usersFilter = {}
    let messagesFilter = {}

    keyword = keyword?.trim()
    if (keyword) {
        usersFilter = {
            full_name: {
                [Op.like]: `%${keyword}%`,
            },
        }
        messagesFilter = {
            content: {
                [Op.like]: `%${keyword}%`,
            },
        }
    }

    const data = await ConversationModel.paginate(request, {
        include: [
            {
                model: UserModel,
                as: 'user',
                where: usersFilter,
                required: true,
                attributes: ['id', 'full_name', 'status'],
            },
            {
                model: MessageModel,
                as: 'messages',
                where: messagesFilter,
                required: false,
                attributes: ['id', 'content'],
            },
        ],
    })

    /* send response */
    return response.json({
        data,
    })
}