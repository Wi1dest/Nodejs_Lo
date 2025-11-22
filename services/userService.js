const User = require('../models/User');
const PoetryResult = require('../utils/result');
const PoetryCache = require('../utils/cache');
const PoetryUtil = require('../utils/util');
const CryptoUtil = require('../utils/crypto');
const constants = require('../utils/constants');
const { Op } = require('sequelize');

class UserService {
  // 登录
  async login(account, password, isAdmin = false) {
    try {
      // 解密密码（前端用AES加密了）
      password = CryptoUtil.aesDecrypt(password);

      // 查询用户
      const user = await User.findOne({
        where: {
          [Op.or]: [
            { username: account },
            { email: account },
            { phoneNumber: account }
          ],
          password: CryptoUtil.md5(password),
          userStatus: true,
          deleted: false
        }
      });

      if (!user) {
        return PoetryResult.fail('账号/密码错误，请重新输入！');
      }

      if (!user.userStatus) {
        return PoetryResult.fail('账号被冻结！');
      }

      if (isAdmin) {
        if (user.userType !== constants.USER_TYPE_ADMIN && user.userType !== constants.USER_TYPE_DEV) {
          return PoetryResult.fail('请输入管理员账号！');
        }
      }

      // 检查是否有已存在的token
      let adminToken = null;
      let userToken = null;

      if (isAdmin) {
        adminToken = await PoetryCache.get(constants.ADMIN_TOKEN + user.id);
      } else {
        userToken = await PoetryCache.get(constants.USER_TOKEN + user.id);
      }

      // 将用户对象转换为纯JSON对象（避免Sequelize模型序列化问题）
      const userData = user.toJSON();

      // 生成新token
      if (isAdmin && !adminToken) {
        const uuid = PoetryUtil.generateToken(constants.ADMIN_ACCESS_TOKEN);
        adminToken = uuid;
        await PoetryCache.put(adminToken, userData, constants.TOKEN_EXPIRE);
        await PoetryCache.put(constants.ADMIN_TOKEN + user.id, adminToken, constants.TOKEN_EXPIRE);
      } else if (!isAdmin && !userToken) {
        const uuid = PoetryUtil.generateToken(constants.USER_ACCESS_TOKEN);
        userToken = uuid;
        await PoetryCache.put(userToken, userData, constants.TOKEN_EXPIRE);
        await PoetryCache.put(constants.USER_TOKEN + user.id, userToken, constants.TOKEN_EXPIRE);
      } else {
        // 如果token已存在，也要更新缓存中的用户数据
        if (isAdmin && adminToken) {
          await PoetryCache.put(adminToken, userData, constants.TOKEN_EXPIRE);
        } else if (!isAdmin && userToken) {
          await PoetryCache.put(userToken, userData, constants.TOKEN_EXPIRE);
        }
      }

      // 构建返回的用户信息
      const userVO = user.toJSON();
      delete userVO.password;
      userVO.accessToken = isAdmin ? adminToken : userToken;
      
      if (isAdmin && user.userType === constants.USER_TYPE_ADMIN) {
        userVO.isBoss = true;
      }

      return PoetryResult.success(userVO);
    } catch (error) {
      console.error('Login error:', error);
      return PoetryResult.fail('登录失败：' + error.message);
    }
  }

  // Token登录
  async token(userToken) {
    try {
      userToken = CryptoUtil.aesDecrypt(userToken);

      if (!userToken) {
        return PoetryResult.fail('未登录，请登录后再进行操作！');
      }

      const user = await PoetryCache.get(userToken);

      if (!user) {
        return PoetryResult.fail('登录已过期，请重新登录！');
      }

      const userVO = user;
      delete userVO.password;
      userVO.accessToken = userToken;

      return PoetryResult.success(userVO);
    } catch (error) {
      return PoetryResult.fail('Token验证失败：' + error.message);
    }
  }

  // 退出
  async exit(req) {
    try {
      const token = PoetryUtil.getToken(req);
      const userId = await PoetryUtil.getUserId(req);
      
      if (!token || !userId) {
        return PoetryResult.success();
      }

      if (token.includes(constants.USER_ACCESS_TOKEN)) {
        PoetryCache.remove(constants.USER_TOKEN + userId);
      } else if (token.includes(constants.ADMIN_ACCESS_TOKEN)) {
        PoetryCache.remove(constants.ADMIN_TOKEN + userId);
      }
      
      PoetryCache.remove(token);
      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('退出失败：' + error.message);
    }
  }

  // 注册
  async regist(userVO) {
    try {
      // 检查用户名是否已存在
      const existingUser = await User.findOne({
        where: {
          username: userVO.username,
          deleted: false
        }
      });

      if (existingUser) {
        return PoetryResult.fail('用户名已存在！');
      }

      // 创建新用户
      const password = CryptoUtil.aesDecrypt(userVO.password);
      const newUser = await User.create({
        username: userVO.username,
        password: CryptoUtil.md5(password),
        userStatus: true,
        userType: constants.USER_TYPE_NORMAL,
        avatar: 'https://i.ibb.co/5RDrH3S/image.png',
        deleted: false
      });

      const result = newUser.toJSON();
      delete result.password;
      
      return PoetryResult.success(result);
    } catch (error) {
      console.error('Regist error:', error);
      return PoetryResult.fail('注册失败：' + error.message);
    }
  }

  // 更新用户信息
  async updateUserInfo(userVO, req) {
    try {
      const userId = await PoetryUtil.getUserId(req);
      
      if (!userId) {
        return PoetryResult.fail('未登录！');
      }

      const user = await User.findByPk(userId);
      if (!user) {
        return PoetryResult.fail('用户不存在！');
      }

      // 更新字段
      const updateData = {};
      if (userVO.avatar !== undefined) updateData.avatar = userVO.avatar;
      if (userVO.gender !== undefined) updateData.gender = userVO.gender;
      if (userVO.introduction !== undefined) updateData.introduction = userVO.introduction;
      if (userVO.admire !== undefined) updateData.admire = userVO.admire;

      await user.update(updateData);

      // 清除缓存
      PoetryCache.remove(constants.USER_CACHE + userId);

      const result = user.toJSON();
      delete result.password;
      
      return PoetryResult.success(result);
    } catch (error) {
      return PoetryResult.fail('更新失败：' + error.message);
    }
  }

  // 根据用户名查找用户
  async getUserByUsername(username) {
    try {
      const users = await User.findAll({
        where: {
          username: {
            [Op.like]: `%${username}%`
          },
          deleted: false
        },
        attributes: { exclude: ['password'] }
      });

      return PoetryResult.success(users);
    } catch (error) {
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }

  // 获取验证码（简化实现）
  async getCode(flag) {
    // 这里应该实现邮件或短信发送验证码的逻辑
    const code = PoetryUtil.generateCode();
    // 应该存储到缓存中
    return PoetryResult.success({ code: code });
  }

  // 绑定手机号或邮箱的验证码
  async getCodeForBind(place, flag) {
    const code = PoetryUtil.generateCode();
    return PoetryResult.success({ code: code });
  }

  // 更新敏感信息（手机号、邮箱、密码）
  async updateSecretInfo(place, flag, code, password, req) {
    try {
      const userId = await PoetryUtil.getUserId(req);
      const user = await User.findByPk(userId);
      
      if (!user) {
        return PoetryResult.fail('用户不存在！');
      }

      const updateData = {};
      if (flag === 1) {
        // 更新手机号
        updateData.phoneNumber = place;
      } else if (flag === 2) {
        // 更新邮箱
        updateData.email = place;
      } else if (flag === 3) {
        // 更新密码
        const oldPassword = CryptoUtil.md5(place);
        if (user.password !== oldPassword) {
          return PoetryResult.fail('原密码错误！');
        }
        updateData.password = CryptoUtil.md5(password);
      }

      await user.update(updateData);
      PoetryCache.remove(constants.USER_CACHE + userId);

      const result = user.toJSON();
      delete result.password;
      
      return PoetryResult.success(result);
    } catch (error) {
      return PoetryResult.fail('更新失败：' + error.message);
    }
  }

  // 忘记密码 - 获取验证码
  async getCodeForForgetPassword(place, flag) {
    const code = PoetryUtil.generateCode();
    return PoetryResult.success({ code: code });
  }

  // 忘记密码 - 更新密码
  async updateForForgetPassword(place, flag, code, password) {
    try {
      const where = {};
      if (flag === 1) {
        where.phoneNumber = place;
      } else if (flag === 2) {
        where.email = place;
      }

      const user = await User.findOne({ where });
      
      if (!user) {
        return PoetryResult.fail('用户不存在！');
      }

      const newPassword = CryptoUtil.md5(password);
      await user.update({ password: newPassword });

      return PoetryResult.success();
    } catch (error) {
      return PoetryResult.fail('更新失败：' + error.message);
    }
  }

  // 订阅/取消订阅
  async subscribe(labelId, flag, req) {
    try {
      const userId = await PoetryUtil.getUserId(req);
      const user = await User.findByPk(userId);
      
      if (!user) {
        return PoetryResult.fail('用户不存在！');
      }

      let subscribeList = [];
      if (user.subscribe) {
        try {
          subscribeList = JSON.parse(user.subscribe);
        } catch (e) {
          subscribeList = [];
        }
      }

      if (flag) {
        // 订阅
        if (!subscribeList.includes(labelId)) {
          subscribeList.push(labelId);
        }
      } else {
        // 取消订阅
        subscribeList = subscribeList.filter(id => id !== labelId);
      }

      await user.update({ subscribe: JSON.stringify(subscribeList) });
      PoetryCache.remove(constants.USER_CACHE + userId);

      const result = user.toJSON();
      delete result.password;
      
      return PoetryResult.success(result);
    } catch (error) {
      return PoetryResult.fail('操作失败：' + error.message);
    }
  }

  // 管理员查询用户列表
  async listUser(baseRequestVO) {
    try {
      const page = baseRequestVO.current || baseRequestVO.page || 1;
      const pageSize = baseRequestVO.size || baseRequestVO.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const where = {
        deleted: false
      };

      if (baseRequestVO.userStatus !== null && baseRequestVO.userStatus !== undefined) {
        where.userStatus = baseRequestVO.userStatus;
      }

      if (baseRequestVO.userType !== null && baseRequestVO.userType !== undefined) {
        where.userType = baseRequestVO.userType;
      }

      if (baseRequestVO.searchKey) {
        where[Op.or] = [
          { username: baseRequestVO.searchKey },
          { phoneNumber: baseRequestVO.searchKey }
        ];
      }

      const { count, rows } = await User.findAndCountAll({
        where,
        limit: pageSize,
        offset: offset,
        order: [['create_time', 'DESC']]
      });

      // 格式化返回数据，确保字段名与原版一致
      const records = rows.map(row => {
        const data = row.toJSON ? row.toJSON() : row;
        
        // 构建符合原版格式的对象（包含所有字段，但password和openId设为null）
        const result = {
          id: data.id,
          username: data.username,
          password: null, // 原版将password设为null
          phoneNumber: data.phoneNumber || null,
          email: data.email || null,
          userStatus: data.userStatus,
          gender: data.gender || null,
          openId: null, // 原版将openId设为null
          avatar: data.avatar || null,
          admire: data.admire || null,
          subscribe: data.subscribe || null,
          introduction: data.introduction || null,
          userType: data.userType,
          updateBy: data.updateBy || null,
          deleted: data.deleted || false
        };
        
        // 处理日期字段：原版返回 ISO 格式字符串（LocalDateTime 格式，没有时区）
        // 将 create_time 或 createdAt 转换为 createTime（统一转换为东八区）
        let createTime = data.create_time || data.createdAt;
        if (createTime) {
          // 统一转换为 Date 对象处理时区
          const date = new Date(createTime);
          // 转换为东八区时间
          const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
          const beijingTime = new Date(utcTime + (8 * 60 * 60 * 1000));
          const year = beijingTime.getFullYear();
          const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
          const day = String(beijingTime.getDate()).padStart(2, '0');
          const hours = String(beijingTime.getHours()).padStart(2, '0');
          const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
          const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
          result.createTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        } else {
          result.createTime = null;
        }
        
        // 处理 updateTime（统一转换为东八区）
        let updateTime = data.update_time || data.updatedAt;
        if (updateTime) {
          // 统一转换为 Date 对象处理时区
          const date = new Date(updateTime);
          // 转换为东八区时间
          const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
          const beijingTime = new Date(utcTime + (8 * 60 * 60 * 1000));
          const year = beijingTime.getFullYear();
          const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
          const day = String(beijingTime.getDate()).padStart(2, '0');
          const hours = String(beijingTime.getHours()).padStart(2, '0');
          const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
          const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
          result.updateTime = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        } else {
          result.updateTime = null;
        }
        
        return result;
      });

      const result = {
        records: records,
        total: count,
        size: pageSize,
        current: page,
        pages: Math.ceil(count / pageSize)
      };

      return PoetryResult.success(result);
    } catch (error) {
      console.error('List user error:', error);
      return PoetryResult.fail('查询失败：' + error.message);
    }
  }
}

module.exports = new UserService();
