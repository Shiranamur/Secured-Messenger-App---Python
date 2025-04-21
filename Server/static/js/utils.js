function getCookie(cookieName) {
    return document.cookie.split('; ')
        .find(row => row.startsWith(cookieName + '='))
        ?.split('=')[1];
}

export { getCookie };