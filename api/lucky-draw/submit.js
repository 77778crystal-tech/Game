const FEISHU_API = 'https://open.feishu.cn/open-apis';

const FIELD_NAMES = {
  name: process.env.FEISHU_FIELD_NAME || '用户姓名',
  userId: process.env.FEISHU_FIELD_USER_ID || '飞书用户 ID',
  openId: process.env.FEISHU_FIELD_OPEN_ID || 'open_id',
  email: process.env.FEISHU_FIELD_EMAIL || '邮箱',
  employeeId: process.env.FEISHU_FIELD_EMPLOYEE_ID || '工号',
  submittedAt: process.env.FEISHU_FIELD_SUBMITTED_AT || '提交时间',
  progress: process.env.FEISHU_FIELD_PROGRESS || '游戏进度',
  completedCount: process.env.FEISHU_FIELD_COMPLETED_COUNT || '已完成 booth 数量',
  completedBooths: process.env.FEISHU_FIELD_COMPLETED_BOOTHS || '已完成 booth 列表',
  status: process.env.FEISHU_FIELD_STATUS || '提交状态'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ success: false, status: 'error', message: 'Method Not Allowed' });
    return;
  }

  try {
    const body = parseBody(req.body);
    const completedCount = Number(body.completedCount);
    const totalBooths = Number(body.totalBooths);
    const completedBoothIds = Array.isArray(body.completedBoothIds) ? body.completedBoothIds : [];

    if (completedCount !== 7 || totalBooths !== 7 || completedBoothIds.length < 7) {
      res.status(400).json({
        success: false,
        status: 'notCompleted',
        message: '请先完成全部关卡后再参与抽奖。'
      });
      return;
    }

    const user = await getFeishuUser(body.feishuAuthCode);
    const stableUserId = user.user_id || user.open_id || user.union_id;
    if (!stableUserId) {
      res.status(401).json({
        success: false,
        status: 'noFeishuUser',
        message: '请在飞书内打开该游戏后再提交抽奖报名。'
      });
      return;
    }

    const tenantToken = await getTenantAccessToken();
    const existing = await findExistingSubmission(tenantToken, stableUserId);
    if (existing) {
      res.status(200).json({
        success: true,
        status: 'alreadySubmitted',
        submittedAt: normalizeSubmittedAt(existing.fields?.[FIELD_NAMES.submittedAt])
      });
      return;
    }

    const submittedAtMs = Date.now();
    await createSubmissionRecord(tenantToken, {
      user,
      stableUserId,
      submittedAtMs,
      completedCount,
      totalBooths,
      completedBoothIds
    });

    res.status(200).json({
      success: true,
      status: 'submitted',
      submittedAt: new Date(submittedAtMs).toISOString()
    });
  } catch (error) {
    console.error('[lucky-draw-submit]', error);
    const status = error.code === 'NO_FEISHU_USER' ? 'noFeishuUser' : 'error';
    res.status(status === 'noFeishuUser' ? 401 : 500).json({
      success: false,
      status,
      message: status === 'noFeishuUser'
        ? '请在飞书内打开该游戏后再提交抽奖报名。'
        : '提交失败，请稍后重试。'
    });
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

async function getTenantAccessToken() {
  const { FEISHU_APP_ID, FEISHU_APP_SECRET } = process.env;
  if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
    throw new Error('Missing FEISHU_APP_ID or FEISHU_APP_SECRET');
  }

  const data = await feishuFetch('/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    body: {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    }
  });
  return data.tenant_access_token;
}

async function getAppAccessToken() {
  const { FEISHU_APP_ID, FEISHU_APP_SECRET } = process.env;
  if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
    throw new Error('Missing FEISHU_APP_ID or FEISHU_APP_SECRET');
  }

  const data = await feishuFetch('/auth/v3/app_access_token/internal', {
    method: 'POST',
    body: {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    }
  });
  return data.app_access_token;
}

async function getFeishuUser(authCode) {
  if (!authCode) {
    const error = new Error('No Feishu auth code');
    error.code = 'NO_FEISHU_USER';
    throw error;
  }

  const appAccessToken = await getAppAccessToken();
  const tokenData = await exchangeAuthCode(authCode, appAccessToken);
  const userAccessToken = tokenData.access_token || tokenData.user_access_token;
  if (!userAccessToken) {
    const error = new Error('No user access token');
    error.code = 'NO_FEISHU_USER';
    throw error;
  }

  const userInfo = await feishuFetch('/authen/v1/user_info', {
    method: 'GET',
    token: userAccessToken
  });
  return userInfo.data || userInfo;
}

async function exchangeAuthCode(authCode, appAccessToken) {
  try {
    return await feishuFetch('/authen/v1/oidc/access_token', {
      method: 'POST',
      token: appAccessToken,
      body: {
        grant_type: 'authorization_code',
        code: authCode
      }
    });
  } catch {
    return feishuFetch('/authen/v1/access_token', {
      method: 'POST',
      token: appAccessToken,
      body: {
        grant_type: 'authorization_code',
        code: authCode
      }
    });
  }
}

async function findExistingSubmission(tenantToken, stableUserId) {
  const data = await feishuFetch(`/bitable/v1/apps/${bitableAppToken()}/tables/${bitableTableId()}/records/search`, {
    method: 'POST',
    token: tenantToken,
    body: {
      page_size: 1,
      filter: {
        conjunction: 'and',
        conditions: [
          {
            field_name: FIELD_NAMES.userId,
            operator: 'is',
            value: [stableUserId]
          }
        ]
      }
    }
  });
  return data.data?.items?.[0] || null;
}

async function createSubmissionRecord(tenantToken, submission) {
  const { user, stableUserId, submittedAtMs, completedCount, totalBooths, completedBoothIds } = submission;
  const fields = {
    [FIELD_NAMES.name]: user.name || user.en_name || '',
    [FIELD_NAMES.userId]: stableUserId,
    [FIELD_NAMES.openId]: user.open_id || '',
    [FIELD_NAMES.email]: user.email || '',
    [FIELD_NAMES.employeeId]: user.employee_id || '',
    [FIELD_NAMES.submittedAt]: submittedAtMs,
    [FIELD_NAMES.progress]: `${completedCount}/${totalBooths}`,
    [FIELD_NAMES.completedCount]: completedCount,
    [FIELD_NAMES.completedBooths]: completedBoothIds.join(','),
    [FIELD_NAMES.status]: 'submitted'
  };

  await feishuFetch(`/bitable/v1/apps/${bitableAppToken()}/tables/${bitableTableId()}/records`, {
    method: 'POST',
    token: tenantToken,
    body: { fields }
  });
}

function bitableAppToken() {
  if (!process.env.FEISHU_BITABLE_APP_TOKEN) {
    throw new Error('Missing FEISHU_BITABLE_APP_TOKEN');
  }
  return process.env.FEISHU_BITABLE_APP_TOKEN;
}

function bitableTableId() {
  if (!process.env.FEISHU_BITABLE_TABLE_ID) {
    throw new Error('Missing FEISHU_BITABLE_TABLE_ID');
  }
  return process.env.FEISHU_BITABLE_TABLE_ID.split('&')[0];
}

async function feishuFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${FEISHU_API}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || (typeof data.code === 'number' && data.code !== 0)) {
    const error = new Error(data.msg || data.message || `Feishu API failed: ${path}`);
    error.response = data;
    throw error;
  }

  return data;
}

function normalizeSubmittedAt(value) {
  if (!value) return undefined;
  if (typeof value === 'number') return new Date(value).toISOString();
  return String(value);
}
