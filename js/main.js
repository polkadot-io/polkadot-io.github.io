main ={

    currentSectionID: null,

    init: function(){

        main.initEvents();
        main.setCurrentSection();
    },

    initEvents: function(){

        $(window).on('scroll', function () {
            if ( !$('body').hasClass('scrollling') ){
                main.setCurrentSection();
            }
        });

        $('.menuMobile').on('click', function(){
            $(this).closest('.main-header').toggleClass('active');
            $('body').toggleClass('mobile-overflow');
        });

        $('.heroScrollTrigger').on('click', function(){
            var pos = $('.hero').outerHeight()+ $('.hero').offset().top - $('.main-header').outerHeight();

            $('body, html').animate({scrollTop: pos}, 1000, 'swing');
        });

        $('.scrollSectionTrigger').on('click', function(e){
            e.preventDefault();

            var target = $(this).attr('href'),
                id = target.split('#'),
                pos = $(target).offset().top - $('.main-header').outerHeight();

            //console.log(id[1]);

            main.setActiveNavElement(id[1]);

            $('body').addClass('scrollling');
            $('body, html').animate({scrollTop: pos}, 1000, 'swing');

            setTimeout(function(){
                $('body').removeClass('scrollling');
                main.setCurrentSection();

            }, 1000);
        });

    },

    setCurrentSection: function(){
        $('.navSection').each(function(){
            var sectionPos =  $(this).offset().top - $(window).outerHeight()/3,
                scrollTop = $(window).scrollTop(),
                sectionID = $(this).attr('id');

            if ( (sectionPos < scrollTop) ) {
            //&& ( (sectionPos+sectionHeight) < scrollTop )
                main.currentSectionID = sectionID;

                main.setActiveNavElement(sectionID);
            }
        });
    },

    setActiveNavElement: function(id){

        $('.scrollSectionTrigger').blur().removeClass('active');
        $('.scrollSectionTrigger[href^="#'+id+'"]').addClass('active');
    }

};