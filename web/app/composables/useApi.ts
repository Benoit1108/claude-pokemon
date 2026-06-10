// Vue composable wrapping the API service. Reads runtimeConfig at call time
// so SSR + client both work. Memoized per-component instance.

import { ApiClient } from '~/services/api'

export const useApi = () => {
  const config = useRuntimeConfig()
  return new ApiClient({ baseUrl: config.public.apiBase })
}
